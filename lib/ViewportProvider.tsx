import * as React from 'react';
import debounce from 'lodash.debounce';
import memoize from 'memoize-one';
import raf from 'raf';

import {
  shallowEqualScroll,
  shallowEqualPrivateScroll,
  shallowEqualDimensions,
  browserSupportsPassiveEvents,
} from './utils';

import {
  IDimensions,
  IPrivateScroll,
  IScroll,
  TViewportChangeHandler,
  IViewportChangeOptions,
} from './types';

interface IListener extends IViewportChangeOptions {
  handler: TViewportChangeHandler;
}

export const SCROLL_DIR_DOWN = Symbol('SCROLL_DIR_DOWN');
export const SCROLL_DIR_UP = Symbol('SCROLL_DIR_UP');
export const SCROLL_DIR_LEFT = Symbol('SCROLL_DIR_LEFT');
export const SCROLL_DIR_RIGHT = Symbol('SCROLL_DIR_RIGHT');

const ViewportContext = React.createContext({
  removeViewportChangeListener: (handler: TViewportChangeHandler) => {},
  addViewportChangeListener: (
    handler: TViewportChangeHandler,
    options: IViewportChangeOptions,
  ) => {},
});

const getNodeScroll = (elem = window) => {
  let { scrollX, scrollY } = elem;
  if (scrollX === undefined) {
    scrollX = elem.pageXOffset;
  }
  if (scrollY === undefined) {
    scrollY = elem.pageYOffset;
  }

  return {
    x: scrollX,
    y: scrollY,
  };
};

const getClientDimensions = (): IDimensions => {
  if (!document || !document.documentElement) {
    return createEmptyDimensionState();
  }
  const { innerWidth, innerHeight, outerWidth, outerHeight } = window;
  const {
    clientWidth,
    clientHeight,
    scrollHeight,
    scrollWidth,
    offsetHeight,
    offsetWidth,
  } = document.documentElement;
  return {
    width: innerWidth,
    height: innerHeight,
    clientWidth,
    clientHeight,
    outerWidth,
    outerHeight,
    documentWidth: Math.max(scrollWidth, offsetWidth, clientWidth),
    documentHeight: Math.max(scrollHeight, offsetHeight, clientHeight),
  };
};

const getXDir = (x: number, prev: IPrivateScroll) => {
  switch (true) {
    case x < prev.x:
      return SCROLL_DIR_LEFT;
    case x > prev.x:
      return SCROLL_DIR_RIGHT;
    case x === prev.x:
      return prev.xDir;
    default:
      throw new Error('Could not calculate xDir');
  }
};

const getYDir = (y: number, prev: IPrivateScroll) => {
  switch (true) {
    case y < prev.y:
      return SCROLL_DIR_UP;
    case y > prev.y:
      return SCROLL_DIR_DOWN;
    case y === prev.y:
      return prev.yDir;
    default:
      throw new Error('Could not calculate yDir');
  }
};

const privateToPublicScroll = ({
  yDir,
  xDir,
  ...scroll
}: IPrivateScroll): IScroll => {
  return {
    ...scroll,
    isScrollingUp: yDir === SCROLL_DIR_UP,
    isScrollingDown: yDir === SCROLL_DIR_DOWN,
    isScrollingLeft: xDir === SCROLL_DIR_LEFT,
    isScrollingRight: xDir === SCROLL_DIR_RIGHT,
  };
};

const createInitPrivateScrollState = () => ({
  x: 0,
  y: 0,
  xDir: undefined,
  yDir: undefined,
  xTurn: 0,
  yTurn: 0,
  xDTurn: 0,
  yDTurn: 0,
});

const createEmptyDimensionState = (): IDimensions => ({
  width: 0,
  height: 0,
  clientWidth: 0,
  clientHeight: 0,
  outerWidth: 0,
  outerHeight: 0,
  documentWidth: 0,
  documentHeight: 0,
});

export const createInitScrollState = (): IScroll =>
  privateToPublicScroll(createInitPrivateScrollState());

export const createInitDimensionsState = (): IDimensions => {
  if (typeof window === 'undefined') {
    return createEmptyDimensionState();
  }
  return getClientDimensions();
};

export const Consumer = ViewportContext.Consumer;
export default class ViewportProvider extends React.PureComponent {
  private scrollState: IPrivateScroll;
  private dimensionsState: IDimensions;
  private lastSyncedScrollState: IPrivateScroll;
  private lastSyncedDimensionsState: IDimensions;
  private tickId: NodeJS.Timer;
  private componentMightHaveUpdated: boolean;
  private listeners: IListener[] = [];

  constructor(props: {}) {
    super(props);
    this.scrollState = createInitPrivateScrollState();
    this.dimensionsState = createInitDimensionsState();
    this.lastSyncedDimensionsState = { ...this.dimensionsState };
    this.lastSyncedScrollState = { ...this.scrollState };
  }

  componentDidMount() {
    const options = browserSupportsPassiveEvents ? { passive: true } : false;
    window.addEventListener('scroll', this.handleScroll, options);
    window.addEventListener('resize', this.handleResize, options);
    window.addEventListener('orientationchange', this.handleResize, options);

    this.tickId = raf(this.tick);
  }

  componentWillUnmount() {
    window.removeEventListener('scroll', this.handleScroll, false);
    window.removeEventListener('resize', this.handleResize, false);
    window.removeEventListener('orientationchange', this.handleResize, false);
    raf.cancel(this.tickId);
    this.listeners = [];
  }

  tick = () => {
    if (this) {
      if (this.componentMightHaveUpdated) {
        this.syncState();
      }
      this.componentMightHaveUpdated = false;
      this.tickId = raf(this.tick);
    }
  };

  handleScroll = () => {
    const { x, y } = getNodeScroll();
    const {
      xDir: prevXDir,
      yDir: prevYDir,
      xTurn: prevXTurn,
      yTurn: prevYTurn,
    } = this.scrollState;

    this.scrollState.xDir = getXDir(x, this.scrollState);
    this.scrollState.yDir = getYDir(y, this.scrollState);

    this.scrollState.xTurn = this.scrollState.xDir === prevXDir ? prevXTurn : x;
    this.scrollState.yTurn = this.scrollState.yDir === prevYDir ? prevYTurn : y;

    this.scrollState.xDTurn = x - this.scrollState.xTurn;
    this.scrollState.yDTurn = y - this.scrollState.yTurn;

    this.scrollState.x = x;
    this.scrollState.y = y;

    this.componentMightHaveUpdated = true;
  };

  handleResize = debounce(() => {
    Object.assign(this.dimensionsState, getClientDimensions());

    this.componentMightHaveUpdated = true;
  }, 80);

  getPublicScroll: ((scroll: IScroll) => IScroll) = memoize(
    (scroll: IScroll): IScroll => scroll,
    shallowEqualScroll,
  );

  getPublicDimensions: ((dimensions: IDimensions) => IDimensions) = memoize(
    (dimensions: IDimensions): IDimensions => dimensions,
    shallowEqualDimensions,
  );

  syncState = () => {
    const scrollDidUpdate = !shallowEqualPrivateScroll(
      this.lastSyncedScrollState,
      this.scrollState,
    );
    const dimensionsDidUpdate = !shallowEqualDimensions(
      this.lastSyncedDimensionsState,
      this.dimensionsState,
    );

    if (scrollDidUpdate) {
      this.lastSyncedScrollState = { ...this.scrollState };
    }

    if (dimensionsDidUpdate) {
      this.lastSyncedDimensionsState = { ...this.dimensionsState };
    }

    if (scrollDidUpdate || dimensionsDidUpdate) {
      const publicState = this.getPropsFromState();
      const updatableListeners = this.listeners.filter(
        ({ notifyScroll, notifyDimensions }) =>
          (notifyScroll() && scrollDidUpdate) ||
          (notifyDimensions() && dimensionsDidUpdate),
      );
      const layouts = updatableListeners.map(
        ({ recalculateLayoutBeforeUpdate }) => {
          if (recalculateLayoutBeforeUpdate) {
            return recalculateLayoutBeforeUpdate(publicState);
          }
          return null;
        },
      );

      updatableListeners.forEach(({ handler }, index) => {
        const layout = layouts[index];
        handler(publicState, layout);
      });
    }
  };

  getPropsFromState() {
    return {
      scroll: this.getPublicScroll(
        privateToPublicScroll(this.lastSyncedScrollState),
      ),
      dimensions: this.getPublicDimensions({
        ...this.lastSyncedDimensionsState,
      }),
    };
  }

  addViewportChangeListener = (
    handler: TViewportChangeHandler,
    options: IViewportChangeOptions,
  ) => {
    this.listeners.push({ handler, ...options });
  };

  removeViewportChangeListener = (h: TViewportChangeHandler) => {
    this.listeners = this.listeners.filter(({ handler }) => handler !== h);
  };

  render() {
    const value = {
      addViewportChangeListener: this.addViewportChangeListener,
      removeViewportChangeListener: this.removeViewportChangeListener,
    };

    return (
      <ViewportContext.Provider value={value}>
        {this.props.children}
      </ViewportContext.Provider>
    );
  }
}
