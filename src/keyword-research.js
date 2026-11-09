const STOP = new Set(("a an and are as at be by for from in into is it of on or that the their this to was were with your you our we website page home about contact services service product products best how what why can will more most using use").split(" "));
export function extractKeywordSignals({title="",description="",headings=[],bodyText=""}={}){
  const scores=new Map();
  const add=(text,weight)=>{const words=String(text||"").toLowerCase().normalize("NFKD").replace(/[^a-z0-9\\s-]/g," ").split(/\\s+/).filter(w=>w.length>2&&!STOP.has(w));for(let i=0;i<words.length;i++){const a=words[i];scores.set(a,(scores.get(a)||0)+weight);if(i+1<words.length){const b=words[i+1];if(!STOP.has(b)){const phrase=a+" "+b;scores.set(phrase,(scores.get(phrase)||0)+weight*1.5)}}}};
  add(title,3);add(description,1.5);for(const h of headings)add(h,2.5);add(bodyText,1);
  return [...scores].filter(([term])=>term.length>2).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,20).map(([term,score])=>({term,score:Number(score.toFixed(1))}));
}
export function compareKeywordCoverage(websiteAudit,competitors){
  const aggregate=audit=>{const map=new Map();for(const page of audit.pages||[])for(const item of page.keywordSignals||[]){map.set(item.term,(map.get(item.term)||0)+item.score)}return map};
  const own=aggregate(websiteAudit), rivals=competitors.map(c=>({url:c.url,terms:aggregate(c.audit)}));
  const competitorTerms=new Map();for(const rival of rivals)for(const [term,score] of rival.terms)competitorTerms.set(term,(competitorTerms.get(term)||0)+score);
  const ownTerms=[...own.keys()];
  const opportunities=[...competitorTerms].filter(([term])=>!own.has(term)).sort((a,b)=>b[1]-a[1]).slice(0,20).map(([term,competitorScore])=>({term,competitorCount:rivals.filter(r=>r.terms.has(term)).length,competitorScore:Number(competitorScore.toFixed(1))}));
  const shared=[...own].filter(([term])=>competitorTerms.has(term)).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([term])=>({term,ownScore:Number(own.get(term).toFixed(1)),competitorCount:rivals.filter(r=>r.terms.has(term)).length}));
  return {mode:"on_page_topic_comparison",website:websiteAudit.website,competitors:rivals.map(r=>r.url),websiteTopics:ownTerms.slice(0,20),sharedTopics:shared,possibleTopicGaps:opportunities,limitations:["Compares visible on-page words, titles, descriptions, and headings only.","Does not provide Google search volume, keyword difficulty, live rankings, search-result positions, backlinks, or traffic estimates.","English-focused tokenization; review suggested terms manually before creating content."]};
}
