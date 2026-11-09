const priorities={high:1,medium:2,low:3,warning:1,info:4};
const guidance=[
  [/missing page title/i,"Add a unique, descriptive title tag (roughly 50–60 characters)."],
  [/missing meta description/i,"Write a useful, page-specific meta description (roughly 140–160 characters)."],
  [/missing h1 heading/i,"Add one clear H1 that describes the page's main topic."],
  [/multiple h1/i,"Review the headings and keep one primary H1; use H2/H3 for sections."],
  [/noindex/i,"Check whether this page should be indexed; remove noindex only if public indexing is intended."],
  [/missing alt text/i,"Add accurate, concise alt text to meaningful images; use empty alt for decorative images."],
  [/http status/i,"Fix the HTTP error and verify the page returns the intended status."],
  [/fetch failed/i,"Check whether the page is reachable and whether the server blocks the audit crawler."],
  [/redirects to/i,"Review the redirect target and update internal links to point directly to the final URL."]
];
export function buildActionPlan(audit){
  if(!audit||!Array.isArray(audit.issues))throw new Error("A completed audit with an issues array is required.");
  const actions=audit.issues.map((item,index)=>{
    const issue=String(item.issue||"Unspecified issue");
    const match=guidance.find(([pattern])=>pattern.test(issue));
    return {priority:item.severity||"info",page:item.page||audit.website||"",issue,action:match?match[1]:"Review this finding and confirm the cause before changing the page.",order:priorities[item.severity]||5,_index:index};
  }).sort((a,b)=>a.order-b.order||a._index-b._index).map(({_index,...item},i)=>({...item,step:i+1}));
  return {agent:"Umar SEO Action Agent",mode:"recommendations_only",website:audit.website||"",createdAt:new Date().toISOString(),summary:{total:actions.length,high:actions.filter(x=>x.priority==="high").length,medium:actions.filter(x=>x.priority==="medium").length,low:actions.filter(x=>x.priority==="low").length},actions,note:"This agent creates a prioritized action plan from your audit. It does not edit or publish your website."};
}
