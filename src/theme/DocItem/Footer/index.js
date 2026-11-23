import markdownPath from '../../../../plugins/markdown-path';
import React from 'react';
import Footer from '@theme-original/DocItem/Footer';
import {useDoc} from '@docusaurus/plugin-content-docs/client';

export default function DocFooter(props) {
  const {metadata} = useDoc();
  return <><a href={markdownPath(metadata)}>查看 Markdown</a><Footer {...props}/></>;
}
