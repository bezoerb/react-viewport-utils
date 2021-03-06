import * as React from 'react';

import {
  shallowEqualRect,
  requestAnimationFrame,
  cancelAnimationFrame,
} from './utils';
import { IRect } from './types';

interface IProps {
  /**
   * Called every time when an update is detected. Same as
   * using `onUpdate` but it requires to render a node.
   */
  children?: (rect: IRect | null) => React.ReactNode;
  /**
   * The reference to the node that should be observed
   */
  node: React.RefObject<HTMLElement>;
  /**
   * Called once a node is mounted for the first time.
   */
  onInit?: (rect: IRect) => void;
  /**
   * Called every time when an update is detected. Same as
   * using `children` but it does not allow to render a node.
   */
  onUpdate?: (rect: IRect) => void;
}

interface IState extends IRect {
  isInitialized: boolean;
}

/**
 * @deprecated Use useRect or useRectEffect instead as it provides better performance.
 */
export default class ObserveBoundingClientRect extends React.PureComponent<
  IProps,
  IState
> {
  private tickId?: number;

  constructor(props: IProps) {
    super(props);
    this.state = {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      height: 0,
      width: 0,
      isInitialized: false,
    };
  }

  componentDidMount() {
    this.tick(this.syncState);
  }

  componentDidUpdate(prevProps: IProps, prevState: IState) {
    const rect = this.getRectFromState();
    const prevRect = this.getRectFromState(prevState);
    if (!rect) {
      return;
    }

    if (this.props.onInit) {
      if (!prevState.isInitialized && this.state.isInitialized) {
        this.props.onInit(rect);
      }
    }

    if (this.props.onUpdate) {
      if (prevRect === null || !shallowEqualRect(rect, prevRect)) {
        this.props.onUpdate(rect);
      }
    }
  }

  componentWillUnmount() {
    if (typeof this.tickId === 'number') {
      cancelAnimationFrame(this.tickId);
    }
  }

  tick(updater: Function) {
    this.tickId = requestAnimationFrame(() => {
      updater();
      this.tick(updater);
    });
  }

  getRectFromState(state: IState = this.state): IRect | null {
    if (!state.isInitialized) {
      return null;
    }

    return {
      height: state.height,
      width: state.width,
      top: state.top,
      bottom: state.bottom,
      left: state.left,
      right: state.right,
    };
  }

  getRectFromNode(): IRect | null {
    const { node } = this.props;
    if (!node || !node.current) {
      return null;
    }

    const rect = node.current.getBoundingClientRect();
    return {
      height: rect.height,
      width: rect.width,
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
    };
  }

  syncState = () => {
    const { node } = this.props;
    if (!node || !node.current) {
      return;
    }
    const rect = this.getRectFromNode();

    if (rect && !this.state.isInitialized) {
      this.setState({ ...rect, isInitialized: true });
      return;
    }

    this.setState(rect);
  };

  render() {
    const { children } = this.props;
    return typeof children === 'function'
      ? children(this.getRectFromState())
      : null;
  }
}
