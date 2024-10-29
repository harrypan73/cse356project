#!/bin/bash

# Description:
# This script renames .m4s files by replacing the bitrate index with the actual bitrate value.
# Example:
# 10727436-hd_1920_1080_24fps_chunk_0_1.m4s -> 10727436-hd_1920_1080_24fps_chunk_254000_1.m4s

# Exit immediately if a command exits with a non-zero status
set -e

# Function to sanitize filenames (replace spaces and special characters with underscores)
sanitize_filename() {
  echo "$1" | sed 's/[^a-zA-Z0-9_-]/_/g'
}

# Enable nullglob to ensure that the for loop doesn't iterate with the pattern itself if no files are found
shopt -s nullglob

# Directory containing the .m4s files
# Change this if your files are in a different directory
DIRECTORY="media_new"

# Create the directory if it doesn't exist
mkdir -p "$DIRECTORY"

# Change to the directory containing the .m4s files
# If your .m4s files are in a different directory, adjust the 'cd' command accordingly
cd "$DIRECTORY"

# Define an array of bitrates corresponding to each index
bitrates=(254000 507000 759000 1013000 1254000 1883000 3134000 4952000)

# Iterate over all .m4s files in the current directory
for file in *.m4s; do
  # Check if file exists (in case no .m4s files are present)
  [ -e "$file" ] || continue

  # Remove the .m4s extension
  base="${file%.m4s}"

  # Split the base into video name and chunk part
  # Assuming the chunk part is always after '_chunk_'
  video_part="${base%%_chunk_*}"
  chunk_part="${base#*_chunk_}"

  # Further split chunk_part into index and number
  index="${chunk_part%%_*}"
  number="${chunk_part#*_}"

  # Check if index is a valid number
  if ! [[ "$index" =~ ^[0-7]+$ ]]; then
    echo "Warning: Invalid index '$index' in file '$file'. Skipping."
    continue
  fi

  # Get the bitrate from the array using index
  bitrate="${bitrates[$index]}"

  # Check if bitrate is defined
  if [[ -z "$bitrate" ]]; then
    echo "Warning: No bitrate mapping for index '$index' in file '$file'. Skipping."
    continue
  fi

  # Sanitize the video name
  sanitized_video_name=$(sanitize_filename "$video_part")

  # Construct the new filename
  new_file="${sanitized_video_name}_chunk_${bitrate}_${number}.m4s"

  # Rename the file
  mv "$file" "$new_file"

  echo "Renamed '$file' to '$new_file'"
done

echo "All files have been processed successfully."
