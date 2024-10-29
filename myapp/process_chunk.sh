#!/bin/bash

# Directory to save the processed chunks
OUTPUT_DIR="media_new"

# Create the output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Loop through each .m4s file in the input directory
for input_file in media/*.m4s; do
  # Extract the base filename
  base_name=$(basename "$input_file" .m4s)
  
  # Define the output file path
  output_file="$OUTPUT_DIR/${base_name}.m4s"
  
  echo "Processing $input_file -> $output_file"

ffmpeg -i ${base_name}.m4s \
  -vf "scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2:black" \
  -c:v libx264 \
  -preset fast \
  -f mp4 \
  -movflags +frag_keyframe+empty_moov \
  output_chunk.m4s

  
  if [ $? -eq 0 ]; then
    echo "Successfully processed $input_file"
  else
    echo "Error processing $input_file"
  fi
done

echo "Batch processing completed."
