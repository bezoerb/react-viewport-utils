import { useContext, useEffect, useLayoutEffect, useState } from 'react';

import { ViewportContext } from './ViewportProvider';
import { IViewport, IScroll, IDimensions, PriorityType } from './types';
import { warnNoContextAvailable } from './utils';

interface IViewPortEffectOptions extends IFullOptions {
  recalculateLayoutBeforeUpdate?: (viewport: IViewport) => any;
  type: 'useScroll' | 'useDimensions' | 'useViewport' | 'useLayoutSnapshot';
}

interface IFullOptions extends IOptions {
  disableScrollUpdates?: boolean;
  disableDimensionsUpdates?: boolean;
}

interface IOptions {
  deferUpdateUntilIdle?: boolean;
  priority?: PriorityType;
  displayName?: string;
}

type HandleViewportChangeType = (options: {
  viewport: IViewport;
  snapshot: any;
}) => void;

const useViewportEffect = (
  handleViewportChange: HandleViewportChangeType,
  options: IViewPortEffectOptions,
) => {
  const {
    addViewportChangeListener,
    removeViewportChangeListener,
    hasRootProviderAsParent,
  } = useContext(ViewportContext);

  if (!hasRootProviderAsParent) {
    warnNoContextAvailable('useViewport');
    return;
  }

  useEffect(() => {
    const handler = (viewport: IViewport, snapshot: any) =>
      handleViewportChange({ viewport, snapshot });
    addViewportChangeListener(handler, {
      notifyScroll: () => !options.disableScrollUpdates,
      notifyDimensions: () => !options.disableDimensionsUpdates,
      notifyOnlyWhenIdle: () => Boolean(options.deferUpdateUntilIdle),
      priority: () => options.priority || 'normal',
      recalculateLayoutBeforeUpdate: options.recalculateLayoutBeforeUpdate,
      displayName: () => options.displayName,
      type: options.type,
    });
    return () => removeViewportChangeListener(handler);
  }, [addViewportChangeListener, removeViewportChangeListener]);
};

export const usePrivateViewport = (
  options: IViewPortEffectOptions,
): IViewport => {
  const { getCurrentViewport } = useContext(ViewportContext);
  const [state, setViewport] = useState(getCurrentViewport());
  useViewportEffect(({ viewport }) => setViewport(viewport), options);

  return state;
};

export const useScroll = (options: IOptions = {}): IScroll => {
  const { scroll } = usePrivateViewport({
    disableDimensionsUpdates: true,
    type: 'useScroll',
    ...options,
  });

  return scroll;
};

export const useDimensions = (options: IOptions = {}): IDimensions => {
  const { dimensions } = usePrivateViewport({
    disableScrollUpdates: true,
    type: 'useDimensions',
    ...options,
  });

  return dimensions;
};

export const useViewport = (options: IFullOptions = {}): IViewport => {
  return usePrivateViewport({
    type: 'useViewport',
    ...options,
  });
};

export const useLayoutSnapshot = <T = any>(
  recalculateLayoutBeforeUpdate: (viewport: IViewport) => T,
  options: IFullOptions = {},
): null | T => {
  const { getCurrentViewport } = useContext(ViewportContext);
  const [state, setSnapshot] = useState<null | T>(null);
  useViewportEffect(({ snapshot }: { snapshot: T }) => setSnapshot(snapshot), {
    type: 'useLayoutSnapshot',
    ...options,
    recalculateLayoutBeforeUpdate,
  });

  useLayoutEffect(() => {
    setSnapshot(recalculateLayoutBeforeUpdate(getCurrentViewport()));
  }, []);

  return state;
};
