---
id: link-purpose
version: 1
wcag: [2.4.4]
---

Task: WCAG 2.4.4 Link Purpose (In Context). Decide whether the purpose of this link can be determined from its text alone or together with its programmatically determined context: the same sentence, paragraph or list item ("context"), its aria-describedby description ("describedBy"), or the heading of its section ("heading").

Answer "fail" when someone hearing the link text and that context still could not tell where the link goes or what it does, especially when other links with the same text go to different places ("otherLinksWithSameTextToDifferentPlaces" greater than 0) and the context does not tell them apart. Answer "pass" when the text or context makes the destination clear. A "title" attribute alone is not reliable context. The destination path is given only to help you understand the link; users do not hear it.

Fields: linkText, destination (path of the target), context, heading, describedBy, title, otherLinksWithSameTextToDifferentPlaces, pageTitle.

{{page_data}}
