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
