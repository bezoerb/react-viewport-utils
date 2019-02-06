import * as React from 'react';

import {
  TViewportChangeHandler,
  IViewportChangeOptions,
  IViewport,
  IViewportCollectorUpdateOptions,
} from './types';
import { uniqueId } from './utils';
import ViewportCollector, {
  getClientDimensions,
  getClientScroll,
} from './ViewportCollector';
import { createPerformanceMarker } from './utils';
import Bridge from './Bridge';

interface IProps {
  experimentalSchedulerEnabled?: boolean;
}

export interface IListener extends IViewportChangeOptions {
  id: string;
  handler: TViewportChangeHandler;
  iterations: number;
  averageLayoutCost: number;
  averageExecutionCost: number;
  skippedIterations: number;
  minLayoutCost: number;
  maxLayoutCost: number;
  lastLayoutCost: number;
  minExecutionCost: number;
  maxExecutionCost: number;
  lastExecutionCost: number;
  totalSkippedIterations: number;
}

const getCurrentDefaultViewport = (): IViewport => {
  return {
    scroll: getClientScroll(),
    dimensions: getClientDimensions(),
  };
};

export const ViewportContext = React.createContext({
  removeViewportChangeListener: (handler: TViewportChangeHandler) => {},
  addViewportChangeListener: (
    handler: TViewportChangeHandler,
    options: IViewportChangeOptions,
  ) => {},
  getCurrentViewport: getCurrentDefaultViewport,
  hasRootProviderAsParent: false,
  version: '__VERSION__',
});

const maxIterations = (priority: 'highest' | 'high' | 'normal' | 'low') => {
  switch (priority) {
    case 'highest':
      return 0;
    case 'high':
      return 4;
    case 'normal':
      return 16;
    case 'low':
      return 64;
  }
};

const shouldSkipIteration = (
  { priority: getPriority, averageExecutionCost, skippedIterations }: IListener,
  budget: number,
): boolean => {
  const priority = getPriority();
  if (priority === 'highest') {
    return false;
  }
  if (priority !== 'low' && averageExecutionCost <= budget) {
    return false;
  }
  if (averageExecutionCost <= budget / 10) {
    return false;
  }
  const probability = skippedIterations / maxIterations(priority);
  if (probability >= 1) {
    return false;
  }
  return Math.random() > probability;
};

export default class ViewportProvider extends React.PureComponent<
  IProps,
  { hasListeners: boolean }
> {
  static defaultProps: {
    experimentalSchedulerEnabled: false;
  };
  private listeners: IListener[] = [];
  private updateListenersTick: NodeJS.Timer;
  private bridge?: Bridge;

  constructor(props: IProps) {
    super(props);
    this.state = {
      hasListeners: false,
    };

    if (typeof window !== 'undefined' && typeof Set !== 'undefined') {
      this.bridge = new Bridge();
    }
  }

  componentWillUnmount() {
    clearTimeout(this.updateListenersTick);
    if (this.bridge) {
      this.bridge.destroy();
    }
  }

  triggerUpdateToListeners = (
    state: IViewport,
    { scrollDidUpdate, dimensionsDidUpdate }: IViewportCollectorUpdateOptions,
    options?: { isIdle: boolean },
  ) => {
    const { isIdle } = Object.assign({ isIdle: false }, options);
    let updatableListeners = this.listeners.filter(
      ({ notifyScroll, notifyDimensions, notifyOnlyWhenIdle }) => {
        if (notifyOnlyWhenIdle() && !isIdle) {
          return false;
        }
        const updateForScroll = notifyScroll() && scrollDidUpdate;
        const updateForDimensions = notifyDimensions() && dimensionsDidUpdate;
        return updateForScroll || updateForDimensions;
      },
    );
    if (this.props.experimentalSchedulerEnabled) {
      if (!isIdle) {
        const budget = 16 / updatableListeners.length;
        updatableListeners = updatableListeners.filter(listener => {
          const skip = shouldSkipIteration(listener, budget);
          if (skip) {
            listener.skippedIterations++;
            listener.totalSkippedIterations++;
            return false;
          }
          listener.skippedIterations = 0;
          return true;
        });
      }
    }
    if (updatableListeners.length === 0) {
      return;
    }
    const layouts = updatableListeners.map(
      ({ recalculateLayoutBeforeUpdate }) => {
        if (recalculateLayoutBeforeUpdate) {
          const getDuration = createPerformanceMarker();
          const layoutState = recalculateLayoutBeforeUpdate(state);
          return [layoutState, getDuration()];
        }
        return null;
      },
    );

    updatableListeners.forEach((listener, index) => {
      const {
        handler,
        averageLayoutCost,
        averageExecutionCost,
        iterations,
      } = listener;
      const [layout, layoutCost] = layouts[index] || [null, 0];

      const getDuration = createPerformanceMarker();
      handler(state, layout);
      const totalCost = layoutCost + getDuration();
      const layoutDiff = layoutCost - averageLayoutCost;
      const executionDiff = totalCost - averageExecutionCost;
      const i = iterations + 1;

      listener.minLayoutCost = listener.minLayoutCost
        ? Math.min(listener.minLayoutCost, layoutCost)
        : layoutCost;
      listener.maxLayoutCost = Math.max(listener.maxLayoutCost, layoutCost);
      listener.averageLayoutCost = averageLayoutCost + layoutDiff / i;
      listener.lastLayoutCost = layoutCost;
      listener.minExecutionCost = listener.minExecutionCost
        ? Math.min(listener.minExecutionCost, totalCost)
        : totalCost;
      listener.maxExecutionCost = Math.max(
        listener.maxExecutionCost,
        totalCost,
      );
      listener.averageExecutionCost = averageExecutionCost + executionDiff / i;
      listener.lastExecutionCost = totalCost;

      listener.iterations = i;
    });
    if (this.bridge) {
      this.bridge.update(this.listeners);
    }
  };

  addViewportChangeListener = (
    handler: TViewportChangeHandler,
    options: IViewportChangeOptions,
  ) => {
    this.listeners.push({
      handler,
      iterations: 0,
      minLayoutCost: 0,
      maxLayoutCost: 0,
      lastLayoutCost: 0,
      averageLayoutCost: 0,
      averageExecutionCost: 0,
      minExecutionCost: 0,
      maxExecutionCost: 0,
      lastExecutionCost: 0,
      skippedIterations: 0,
      totalSkippedIterations: 0,
      id: uniqueId(),
      ...options,
    });
    this.updateHasListenersState();
  };

  removeViewportChangeListener = (h: TViewportChangeHandler) => {
    this.listeners = this.listeners.filter(({ handler }) => handler !== h);
    this.updateHasListenersState();
  };

  updateHasListenersState() {
    clearTimeout(this.updateListenersTick);
    this.updateListenersTick = setTimeout(() => {
      this.setState({
        hasListeners: this.listeners.length !== 0,
      });
      if (this.bridge) {
        this.bridge.update(this.listeners);
      }
    }, 0);
  }

  renderChildren = (props: { hasRootProviderAsParent: boolean }) => {
    if (props.hasRootProviderAsParent) {
      return this.props.children;
    }
    const collector = React.createRef<ViewportCollector>();
    const value = {
      addViewportChangeListener: this.addViewportChangeListener,
      removeViewportChangeListener: this.removeViewportChangeListener,
      getCurrentViewport: () => {
        if (!collector.current) {
          return getCurrentDefaultViewport();
        }
        return collector.current.getPropsFromState();
      },
      hasRootProviderAsParent: true,
      version: '__VERSION__',
    };
    return (
      <React.Fragment>
        {this.state.hasListeners && (
          <ViewportCollector
            ref={collector}
            onUpdate={this.triggerUpdateToListeners}
            onIdledUpdate={(state, updates) =>
              this.triggerUpdateToListeners(state, updates, { isIdle: true })
            }
          />
        )}
        <ViewportContext.Provider value={value}>
          {this.props.children}
        </ViewportContext.Provider>
      </React.Fragment>
    );
  };

  render() {
    return (
      <ViewportContext.Consumer>{this.renderChildren}</ViewportContext.Consumer>
    );
  }
}
