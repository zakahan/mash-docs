const operations = require('./rest-navigation.json');

function restSection(page, label) {
  const prefix = (process.env.DOCS_BASE_URL || '/').replace(/\/$/, '');
  return {type: 'category', label, link: {type: 'doc', id: 'api/' + page},
    items: Object.entries(operations[page]).map(([anchor, name]) => ({
      type: 'link', label: name, href: prefix + '/api/' + page + '#' + anchor,
    }))};
}

module.exports = {manual: [
  'intro',
  {type:'category', label:'Harness App', items:[
    "app/guide",
    {type:'category', label:'实战教学', link:{type:'doc', id:'app/flow'}, items:[
      {type:'doc', id:'app/snapshots', label:'Harness 配置与版本管理'},
      {type:'doc', id:'app/sandbox', label:'在沙箱中执行任务'},
      {type:'doc', id:'app/skills', label:'使用 Skill 完成任务'},
      {type:'doc', id:'app/mcp', label:'调用 MCP 工具'},
    ]},
    "app/advanced",
    "app/permissions",
    "app/artifacts",
    "app/load-test",
  ]},
  {type:'category', label:'Managed Agents Worker', items:['managed/guide','managed/events','managed/resources','managed/config','managed/develop']},
  {type:'category', label:'API 参考', items:['api/index','api/conventions',restSection('app','会话管理接口'),restSection('chat','对话调用接口'),restSection('files','文件操作接口'),
    {type:'category', label:'AgentKit 控制面 接口', items:[
      {type:'doc', id:'api/harness', label:'Harness'},
      {type:'doc', id:'api/environment', label:'Env'},
    ]},
    restSection('session','Managed Agents API：Session 与事件')]},
  'versions'
]};
