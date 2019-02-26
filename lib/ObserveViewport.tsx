import * as React from 'react';

import { ViewportContext } from './ViewportProvider';
import {
  createEmptyDimensionState,
  createEmptyScrollState,
} from './ViewportCollector';
import {
  IScroll,
  IDimensions,
  IViewport,
  TViewportChangeHandler,
  IViewportChangeOptions,
  PriorityType,
} from './types';
import {
  warnNoContextAvailable,
  requestAnimationFrame,
  cancelAnimationFrame,
} from './utils';

export interface IChildProps {
  scroll: IScroll | null;
  dimensions: IDimensions | null;
}

interface IState extends IChildProps {}

interface IProps {
  children?: (props: IChildProps) => React.ReactNode;
  onUpdate?: (props: IChildProps, layoutSnapshot: any) => void;
  recalculateLayoutBeforeUpdate?: (props: IChildProps) => any;
  disableScrollUpdates: boolean;
  disableDimensionsUpdates: boolean;
  deferUpdateUntilIdle: boolean;
  priority: PriorityType;
  displayName?: string;
  debuggerComponentType?: 'connectViewport';
}

interface IContext {
  addViewportChangeListener: (
    handler: TViewportChangeHandler,
    options: IViewportChangeOptions,
  ) => void;
  removeViewportChangeListener: (handler: TViewportChangeHandler) => void;
  hasRootProviderAsParent: boolean;
  getCurrentViewport: () => IViewport;
  version: string;
}

export default class ObserveViewport extends React.Component<IProps, IState> {
  private addViewportChangeListener:
    | ((
        handler: TViewportChangeHandler,
        options: IViewportChangeOptions,
      ) => void)
    | null;
  private removeViewportChangeListener:
    | ((handler: TViewportChangeHandler) => void)
    | null;

  private tickId: number;

  static defaultProps: IProps = {
    disableScrollUpdates: false,
    disableDimensionsUpdates: false,
    deferUpdateUntilIdle: false,
    priority: 'normal',
  };

  constructor(props: IProps) {
    super(props);
    this.state = {
      scroll: createEmptyScrollState(),
      dimensions: createEmptyDimensionState(),
    };
  }

  componentWillUnmount() {
    if (this.removeViewportChangeListener) {
      this.removeViewportChangeListener(this.handleViewportUpdate);
    }
    this.removeViewportChangeListener = null;
    this.addViewportChangeListener = null;
    cancelAnimationFrame(this.tickId);
  }

  handleViewportUpdate = (viewport: IViewport, layoutSnapshot: any) => {
    const scroll = this.props.disableScrollUpdates ? null : viewport.scroll;
    const dimensions = this.props.disableDimensionsUpdates
      ? null
      : viewport.dimensions;
    const nextViewport = {
      scroll: scroll,
      dimensions: dimensions,
    };

    if (this.props.onUpdate) {
      this.props.onUpdate(nextViewport, layoutSnapshot);
    }

    this.syncState(nextViewport);
  };

  syncState(nextViewport: IState) {
    if (this.props.children) {
      cancelAnimationFrame(this.tickId);
      this.tickId = requestAnimationFrame(() => {
        this.setState(nextViewport);
      });
    }
  }

  get optionNotifyScroll(): boolean {
    return !this.props.disableScrollUpdates;
  }

  get optionNotifyDimensions(): boolean {
    return !this.props.disableDimensionsUpdates;
  }

  registerViewportListeners = ({
    addViewportChangeListener,
    removeViewportChangeListener,
    hasRootProviderAsParent,
    getCurrentViewport,
  }: IContext): React.ReactNode => {
    if (!hasRootProviderAsParent) {
      warnNoContextAvailable('ObserveViewport');
      return null;
    }

    const shouldRegister =
      this.removeViewportChangeListener !== removeViewportChangeListener &&
      this.addViewportChangeListener !== addViewportChangeListener;

    if (!shouldRegister) {
      return null;
    }

    if (this.removeViewportChangeListener) {
      this.removeViewportChangeListener(this.handleViewportUpdate);
    }

    this.removeViewportChangeListener = removeViewportChangeListener;
    addViewportChangeListener(this.handleViewportUpdate, {
      notifyScroll: () => !this.props.disableScrollUpdates,
      notifyDimensions: () => !this.props.disableDimensionsUpdates,
      notifyOnlyWhenIdle: () => this.props.deferUpdateUntilIdle,
      priority: () => this.props.priority,
      displayName: () => this.props.displayName,
      recalculateLayoutBeforeUpdate: (viewport: IViewport) => {
        if (this.props.recalculateLayoutBeforeUpdate) {
          return this.props.recalculateLayoutBeforeUpdate(viewport);
        }
        return null;
      },
      type: this.props.debuggerComponentType || 'ObserveViewport',
    });

    this.syncState(getCurrentViewport());

    return null;
  };

  render() {
    const { children } = this.props;
    return (
      <React.Fragment>
        <ViewportContext.Consumer>
          {this.registerViewportListeners}
        </ViewportContext.Consumer>
        {typeof children === 'function' && children(this.state)}
      </React.Fragment>
    );
  }
}
