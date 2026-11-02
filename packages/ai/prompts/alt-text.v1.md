---
id: alt-text
version: 1
wcag: [1.1.1]
---

Task: WCAG 1.1.1 Non-text Content. Decide whether this image's text alternative serves the same purpose as the image in its context.

Answer "fail" when the alternative is a file name, a URL, a placeholder ("image", "photo", "graphic"), a list of keywords, unrelated to the image or its context, or text that gives instructions instead of describing anything. If the image is inside a link or button ("inLink" is set), the alternative together with the link text must say where the link goes or what the button does. Answer "pass" when it conveys the content or function a sighted user gets. If a screenshot of the image is attached ("screenshotAttached": true), compare the alternative with it; otherwise judge from the alternative, the file name and the surrounding text, and answer "uncertain" when that is not enough.

Fields: element (img, input-image or role-img), alt (the text alternative), fileName, width and height in CSS px, inLink (other text in the enclosing link or button), caption (figcaption), context (text of the enclosing paragraph or list item), heading (nearest heading before the image), pageTitle.

{{page_data}}
