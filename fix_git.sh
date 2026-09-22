set -e
git checkout b411392585acfd3f9ce20b87685f3e8b312c990f
git rm --cached test.gguf || true
echo "test.gguf" >> .gitignore
git add .gitignore
git commit --amend --no-edit
git tag -f v1.3.5
git cherry-pick f5dd4e2bd847bb874b0d86bd7bb0b6c1a49a2684
git tag -f v1.3.6
git checkout main
git reset --hard HEAD@{1} # Wait, instead of this, just update main to current HEAD
git branch -f main HEAD
git checkout main
