# Task: Store generated guides

Owner: Leon
Branch: task/store-generated-guides

## Goal
Store the final processed guide JSON in Supabase with its existing ownership.
Preserve the completed local guide if a cloud write fails.

## Scope
Connect final scan output to the existing processed_guides table.
Keep the existing guide format and account behaviour.

## Validation
- Existing repository JSON files saved and retrieved successfully.
- Backend syntax checks pass.
- Production build passes.
- Example guide check shows no errors or warnings.
- Full PDF-generation test remains pending with a configured model API.