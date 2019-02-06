import * as React from 'react';

const SOURCE = '__REACT_VIEWPORT_UTILS__';

interface IDevToolListener {
  updatesOnScroll: boolean;
  updatesOnDimensions: boolean;
  updatesOnIdle: boolean;
  priority: string;
  type: string;
  displayName?: string;
  id: string;
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

const formatDuration = (valueInMs: number) => {
  return `${valueInMs.toFixed(3)} ms`;
};

const percentageSkippedIterations = (iterations: number, skipped: number) => {
  const total = iterations + skipped;
  if (total === 0) {
    return 0;
  }
  return ((skipped / total) * 100).toFixed(1);
};

const useChannel = (update: React.Dispatch<React.SetStateAction<never>>) => {
  const handleEvent = (ev: MessageEvent) => {
    if (ev.data.source === SOURCE) {
      update(ev.data.listeners);
    }
  };

  React.useEffect(() => {
    const channel = new MessageChannel();
    const postMessage = (type: string) => {
      window.postMessage(
        {
          source: SOURCE,
          type,
        },
        '*',
        [channel.port2],
      );
    };
    channel.port1.onmessage = handleEvent;
    postMessage('connect');
    return () => channel.port1.close();
  }, []);
};

const useListeners = () => {
  const [listeners, setListeners] = React.useState<IDevToolListener[]>([]);
  useChannel(setListeners);
  return listeners;
};

const Cell = React.memo((props: IDevToolListener) => {
  const name = props.displayName || props.type || 'unknown';
  return (
    <tr key={props.id}>
      <td>{props.id}</td>
      <td>{name}</td>
      <td>
        {props.iterations} /{' '}
        {percentageSkippedIterations(
          props.iterations,
          props.totalSkippedIterations,
        )}
        %
      </td>
      <td>{formatDuration(props.averageExecutionCost)}</td>
      <td>{formatDuration(props.averageLayoutCost)}</td>
      <td>{props.priority}</td>
    </tr>
  );
});

export default function DevTools() {
  const table = useListeners().sort((a, b) => {
    return a.averageExecutionCost >= b.averageExecutionCost ? -1 : 1;
  });
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        width: '100%',
        background: '#fff',
        zIndex: 99,
      }}
    >
      <table>
        <thead>
          <tr>
            <th>id</th>
            <th>Name</th>
            <th>Updates/ Skipped</th>
            <th>Ave. Exec. Cost</th>
            <th>Ave. Layout Cost</th>
            <th>Prio.</th>
          </tr>
        </thead>
        <tbody>
          {table.map(cell => (
            <Cell key={cell.id} {...cell} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
