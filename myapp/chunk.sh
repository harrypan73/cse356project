#!/bin/bash

# Ensure the output directory exists
mkdir -p processed_videos

# Loop over all MP4 files in the media directory
for input_file in videos/*.mp4; do
  # Get the base filename without extension
  base_name=$(basename "$input_file" .mp4)
  
  # Create an output directory for this video
  output_dir="processed_videos/$base_name"
  mkdir -p "$output_dir"

  echo "Processing $input_file..."

  # Run FFmpeg to generate the DASH segments and manifest
  ffmpeg -y -i "../../$input_file" \
    -map 0:v -b:v:0 254k -s:v:0 320x180 \
    -map 0:v -b:v:1 507k -s:v:1 320x180 \
    -map 0:v -b:v:2 759k -s:v:2 480x270 \
    -map 0:v -b:v:3 1013k -s:v:3 640x360 \
    -map 0:v -b:v:4 1254k -s:v:4 640x360 \
    -map 0:v -b:v:5 1883k -s:v:5 768x432 \
    -map 0:v -b:v:6 3134k -s:v:6 1024x576 \
    -map 0:v -b:v:7 4952k -s:v:7 1280x720 \
    -seg_duration 10 \
    -init_seg_name 'init_$RepresentationID$.m4s' \
    -media_seg_name 'chunk_$Bandwidth$_$Number$.m4s' \
    -use_template 1 -use_timeline 1 \
    -f dash "$output_dir/manifest.mpd"

  echo "Finished processing $input_file. Output in $output_dir."
done

echo "All videos have been processed."
