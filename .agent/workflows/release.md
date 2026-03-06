---
description: How to release code to both Git repositories
---

# Release to Git

When code is ready to release, it **must be pushed to both repositories**:

// turbo-all

1. Stage and commit your changes:
```powershell
git add .
git commit -m "<descriptive commit message>"
```

2. Push to the **development** repo (origin):
```powershell
git push origin master
```

3. Push to the **release** repo (for end users):
```powershell
git push release master
```

## Remotes

| Remote    | URL                                                  | Purpose           |
|-----------|------------------------------------------------------|--------------------|
| `origin`  | https://github.com/eddythedog2020/picobot-chat.git  | Development repo   |
| `release` | https://github.com/eddythedog2020/eddyTheBot.git    | User-facing release |

> **Important**: Never push to only one repo. Both must be kept in sync.
