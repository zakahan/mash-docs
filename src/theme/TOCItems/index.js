import React from 'react';
import TOCItems from '@theme-original/TOCItems';
import navigation from '../../../rest-navigation.json';

const labels = {...navigation.app, ...navigation.session};

export default function OperationTOC({toc, ...props}) {
  return <TOCItems {...props} toc={toc.map(item =>
    labels[item.id] ? {...item, value: labels[item.id]} : item
  )}/>;
}
