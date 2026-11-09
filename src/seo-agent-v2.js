const PRIORITY = { critical: 0, high: 1, medium: 2, low: 3, info: 4, warning: 1 };

function classifyIssue(issueText) {
  const issue = String(issueText || "");
  if (/noindex/i.test(issue)) {
    return {
      category: "indexability",
      priority: "critical",
      task: "Review the noindex directive and confirm whether this page should appear in search results.",
      approvalRequired: true,
      risk: "high"
    };
  }
  if (/http status\s+[45]\d\d/i.test(issue)) {
    return {
      category: "crawlability",
      priority: "high",
      task: "Investigate the HTTP error, identify the cause, and restore the intended response.",
      approvalRequired: true,
      risk: "high"
    };
  }
  if (/missing page title/i.test(issue)) {
    return {
      category: "on_page",
      priority: "high",
      task: "Write a unique title that accurately describes this page and its primary search intent.",
      approvalRequired: true,
      risk: "medium"
    };
  }
  if (/fetch failed/i.test(issue)) {
    return {
      category: "crawlability",
      priority: "high",
      task: "Check availability, DNS, TLS, robots rules, and server access before changing the page.",
      approvalRequired: false,
      risk: "medium"
    };
  }
  if (/missing meta description/i.test(issue)) {
    return {
      category: "on_page",
      priority: "medium",
      task: "Draft a page-specific meta description that accurately summarizes the visible page content.",
      approvalRequired: true,
      risk: "low"
    };
  }
  if (/missing h1 heading/i.test(issue)) {
    return {
      category: "content_structure",
      priority: "medium",
      task: "Add one clear primary heading that describes the page's actual subject.",
      approvalRequired: true,
      risk: "medium"
    };
  }
  if (/multiple h1/i.test(issue)) {
    return {
      category: "content_structure",
      priority: "low",
      task: "Review the heading hierarchy and keep a single primary H1 where it improves clarity.",
      approvalRequired: true,
      risk: "low"
    };
  }
  if (/missing alt text|image\(s\) missing alt text/i.test(issue)) {
    return {
      category: "accessibility",
      priority: "low",
      task: "Add concise, accurate alt text to meaningful images; keep decorative images empty-alt.",
      approvalRequired: true,
      risk: "low"
    };
  }
  if (/canonical/i.test(issue)) {
    return { category: "indexability", priority: "medium", task: "Add one valid absolute canonical URL for this page, normally pointing to its preferred URL. Check that it returns HTTP 200 and does not create a redirect or loop.", approvalRequired: true, risk: "medium" };
  }
  if (/robots\.txt|sitemap/i.test(issue)) {
    return { category: "crawlability", priority: "medium", task: "Check the reported robots.txt or sitemap URL, correct its response and syntax, then verify that the sitemap contains canonical URLs intended for indexing. Do not block important pages.", approvalRequired: true, risk: "medium" };
  }
  if (/mobile viewport/i.test(issue)) {
    return { category: "mobile", priority: "medium", task: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> inside the document head and verify the page at mobile widths.', approvalRequired: true, risk: "low" };
  }
  if (/lang attribute/i.test(issue)) {
    return { category: "accessibility", priority: "low", task: 'Set the html element language, for example <html lang="en">, using the page primary language.', approvalRequired: true, risk: "low" };
  }
  if (/open graph/i.test(issue)) {
    return { category: "social_metadata", priority: "low", task: 'Add page-specific og:title and og:description meta tags in the head; use an accurate title and summary matching the visible page.', approvalRequired: true, risk: "low" };
  }
  if (/structured data/i.test(issue)) {
    return { category: "structured_data", priority: "low", task: "Consider adding valid JSON-LD only when a supported schema type accurately describes the page. Validate the markup before publishing; structured data is optional for many pages.", approvalRequired: true, risk: "low" };
  }
  if (/word(s)?|content/i.test(issue) && /fewer than 100/i.test(issue)) {
    return { category: "content_quality", priority: "info", task: "Review whether the page fully answers its intended visitor need. Add genuinely useful information only where needed; do not add filler just to reach a word count.", approvalRequired: true, risk: "low" };
  }
  if (/longer than the common/i.test(issue)) {
    return { category: "on_page", priority: "low", task: "Review the title or description for concise, page-specific wording. Character ranges are guidelines, not strict ranking rules; preserve clarity and accuracy.", approvalRequired: true, risk: "low" };
  }
  if (/redirects to/i.test(issue)) {
    return {
      category: "technical",
      priority: "low",
      task: "Verify the redirect destination and update internal links only after confirming the intended canonical URL.",
      approvalRequired: true,
      risk: "medium"
    };
  }
  return {
    category: "review",
    priority: "info",
    task: "Review the finding and collect evidence before recommending a change.",
    approvalRequired: false,
    risk: "unknown"
  };
}

/**
 * Build a safe, evidence-based SEO action plan from the existing technical audit.
 * This function does not crawl, edit, or publish a website.
 */
export function runSeoAgentV2(audit) {
  if (!audit || !Array.isArray(audit.issues)) {
    throw new TypeError("A completed audit with an issues array is required.");
  }

  const actions = audit.issues.map((finding, index) => {
    const issue = String(finding?.issue || "Unspecified audit finding");
    const recommendation = classifyIssue(issue);
    return {
      id: `seo-task-${index + 1}`,
      page: String(finding?.page || audit.website || ""),
      issue,
      sourceSeverity: String(finding?.severity || "info"),
      ...recommendation,
      evidence: "technical_audit_finding",
      status: "proposed"
    };
  });

  actions.sort((a, b) =>
    (PRIORITY[a.priority] ?? 5) - (PRIORITY[b.priority] ?? 5)
  );

  const summary = actions.reduce((result, action) => {
    result.total += 1;
    result.byPriority[action.priority] = (result.byPriority[action.priority] || 0) + 1;
    if (action.approvalRequired) result.awaitingApproval += 1;
    return result;
  }, { total: 0, awaitingApproval: 0, byPriority: {} });

  return {
    agent: "Umar SEO Agent V2",
    mode: "evidence_based_planning",
    website: String(audit.website || ""),
    auditDate: audit.scannedAt || null,
    pagesScanned: Number(audit.pagesScanned || 0),
    summary,
    actions,
    limitations: [
      "Uses only findings supplied by the technical audit.",
      "Does not access Google Search Console, Analytics, keyword databases, or competitor data.",
      "Does not edit or publish website content; proposed changes require review and approval."
    ]
  };
}
