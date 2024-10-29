#!/bin/bash

mkdir -p media

# Iterate over each .mp4 file in the videos directory
for video_file in ALLVIDEOS/*.mp4; do
  # Extract the video file name without the extension
  video_name=$(basename "$video_file" .mp4)

  # Run ffmpeg command to create DASH files for each resolution and bitrate
  ffmpeg -i "$video_file" \
    -map 0:v -b:v:0 254k -s:v:0 320x180 \
    -map 0:v -b:v:1 507k -s:v:1 320x180 \
    -map 0:v -b:v:2 759k -s:v:2 480x270 \
    -map 0:v -b:v:3 1013k -s:v:3 640x360 \
    -map 0:v -b:v:4 1254k -s:v:4 640x360 \
    -map 0:v -b:v:5 1883k -s:v:5 768x432 \
    -map 0:v -b:v:6 3134k -s:v:6 1024x576 \
    -map 0:v -b:v:7 4952k -s:v:7 1280x720 \
    -seg_duration 10 \
    -init_seg_name "${video_name}_init_\$RepresentationID\$.m4s" \
    -media_seg_name "${video_name}_chunk_\$Bandwidth\$_\$Number\$.m4s" \
    -use_template 1 -use_timeline 1 \
    -f dash "media/${video_name}_output.mpd"

done