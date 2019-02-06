import { IListener } from './ViewportProvider';

const SOURCE = '__REACT_VIEWPORT_UTILS__';

const isAllowedEvent = (ev: MessageEvent) => {
  return ev.data.source === SOURCE;
};

export default class Bridge {
  channels: Set<MessagePort>;
  ricHandle: RequestIdleCallbackHandle;

  constructor() {
    this.channels = new Set();
    window.addEventListener('message', this.handleEvent);
  }

  destroy() {
    window.removeEventListener('message', this.handleEvent);
    this.channels.clear();
  }

  handleEvent = (ev: MessageEvent) => {
    if (!isAllowedEvent(ev)) {
      return;
    }
    switch (ev.data.type) {
      case 'connect':
        this.channels.add(ev.ports[0]);
        break;
      case 'disconnect':
        this.channels.delete(ev.ports[0]);
        break;
    }
  };

  update(l: IListener[]) {
    if (this.channels.size === 0) {
      return;
    }
    window.cancelIdleCallback(this.ricHandle);
    this.ricHandle = window.requestIdleCallback(() => this.postToChannels(l), {
      timeout: 300,
    });
  }

  postToChannels(l: IListener[]) {
    const listeners = l.map(
      ({
        handler,
        recalculateLayoutBeforeUpdate,
        notifyScroll,
        notifyDimensions,
        notifyOnlyWhenIdle,
        priority,
        displayName,
        ...props
      }) => ({
        ...props,
        updatesOnScroll: notifyScroll(),
        updatesOnDimensions: notifyDimensions(),
        updatesOnIdle: notifyOnlyWhenIdle(),
        priority: priority(),
        displayName: displayName(),
      }),
    );
    this.channels.forEach(port =>
      port.postMessage({
        source: SOURCE,
        version: '__VERSION__',
        type: 'update',
        listeners,
      }),
    );
  }
}
