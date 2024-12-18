#!/bin/bash
SCRIPT_DIR=$( cd -- $( dirname -- ${BASH_SOURCE[0]} ) &> /dev/null && pwd )
ROOT_DIR=$(realpath $SCRIPT_DIR/.)
branch=master

function push-submodule() {
  local dir=$1
  shift 1

  cd $dir
  if [ ! -z "$(git status --porcelain)" ]; then
    git add --all
    git commit -m "$(date)"
    for repo in $*; do
      git push $repo $branch
    done
  fi
}

push-submodule $ROOT_DIR/data/journals origin github

cd $ROOT_DIR
git add --all
git add data/journals
git commit -m "$(date)"
git push origin $branch
git push github $branch

