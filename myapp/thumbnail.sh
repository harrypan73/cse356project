#!/bin/bash

# Iterate over each .mp4 file in the videos directory
for video_file in videos/*.mp4; do
  # Extract the video file name without the extension
  video_name=$(basename "$video_file" .mp4)
  
  # Generate thumbnail from the first frame at 320x180 resolution
  ffmpeg -i "$video_file" -vf "scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2:black" -frames:v 1 "${video_name}_thumbnail.jpg" -y

done