**What and why**

**How I tested it**

- [ ] `backend`: `npm run typecheck && npm test`
- [ ] `web`: `npm run lint && npm run build`
- [ ] Anything that publishes, replies, deletes or spends goes through a `pending` action and the owner's "yes"
- [ ] Review, comment and DM text never reaches a call with tools
- [ ] No secrets, real phone numbers or private infrastructure details in the diff
