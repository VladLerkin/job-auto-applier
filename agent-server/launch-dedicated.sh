#!/bin/bash
open -n -a "Google Chrome" --args \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.ai-job-profile-native" \
  --load-extension="/Users/vlad/IdeaProjects/Auto-resume-filler"
