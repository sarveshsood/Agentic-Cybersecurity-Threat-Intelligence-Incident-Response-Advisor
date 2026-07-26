# Git Workflow

1. `git checkout main && git pull`
2. `git checkout -b feat/my-change`
3. Commit small logical units
4. `make ci-fast` or targeted pytest
5. Push + open PR with template
6. Squash or rebase per maintainer preference
7. Delete branch after merge

**Never** force-push `main`.  
**Never** commit `.env`, keys, or real customer logs.
