# Git Branching and Merging Guide

Git branches allow you to develop features, fix bugs, and experiment with new ideas in isolation from the main codebase.

## Creating Branches

A branch represents an independent line of development. Use `git branch` to create one and `git checkout` (or `git switch`) to move between branches:

```
git branch feature/login
git switch feature/login
```

The `main` branch is the default branch where production-ready code lives. Feature branches diverge from main and merge back when complete.

## Merging Strategies

When a feature is ready, merge it back into main. Git supports several merge strategies:

**Fast-forward merge** happens when main has no new commits since the branch was created. Git simply moves the main pointer forward — no merge commit is created.

**Three-way merge** occurs when both branches have diverged. Git creates a merge commit that combines changes from both branches. Conflicts must be resolved manually when the same lines are modified in both branches.

## Rebasing

Rebasing rewrites commit history by replaying your branch's commits on top of the target branch. This produces a linear history without merge commits:

```
git checkout feature/login
git rebase main
```

Use interactive rebase (`git rebase -i`) to squash, edit, or reorder commits before merging. This keeps the commit history clean and readable.

## Resolving Conflicts

Conflicts occur when two branches modify the same lines. Git marks conflicts in the affected files with `<<<<<<<`, `=======`, and `>>>>>>>` markers. Resolve by editing the file, then stage and commit:

```
git add resolved-file.ts
git commit
```

## Best Practices

- Keep branches short-lived (days, not weeks)
- Merge main into your branch regularly to reduce conflicts
- Use descriptive branch names: `feature/user-auth`, `fix/login-timeout`
- Delete merged branches to keep the repository clean
