import React from 'react';
import Heading from '@theme-original/Heading';

export default function DocHeading(props) {
  const route = props.as === 'h2' && typeof props.children === 'string'
    && /^(GET|POST|PATCH|DELETE|PUT) (\/\S+)$/.exec(props.children);
  if (!route) return <Heading {...props} />;

  const [, method, path] = route;
  return (
    <Heading {...props} className={['api-operation-heading', props.className].filter(Boolean).join(' ')}>
      <span className="api-operation-method">{method}</span>{' '}
      {path.match(/\/[^/]*/g).map((segment, index) => (
        <React.Fragment key={index}>
          {index > 0 && <wbr />}
          <span className="api-path-segment">{segment}</span>
        </React.Fragment>
      ))}
    </Heading>
  );
}
