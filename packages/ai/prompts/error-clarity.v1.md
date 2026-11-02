---
id: error-clarity
version: 1
wcag: [3.3.3]
---

Task: WCAG 3.3.3 Error Suggestion. The form was submitted with invalid input and this error message is on screen. Decide whether the message says what is wrong and, when the correct format or values are known, how to fix it.

Answer "fail" for messages such as "Invalid input", "Error", "Error 42", "Please check this field" or a bare red mark, when the field's constraints ("constraints": type, pattern, length, min, max) show that a concrete suggestion was possible. Answer "pass" when a user could correct the input from the message alone ("Enter an email address like name@example.com", "Password must be at least 12 characters"). A message that only says the field is required passes when nothing more specific could be said.

Fields: errorText, fieldLabel, fieldType, required, constraints, formHeading.

{{page_data}}
