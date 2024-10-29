# #!/bin/bash

# # Iterate over each .mp4 file in the videos directory
# for video_file in videos/*.mp4; do
#   # Extract the video file name without the extension
#   video_name=$(basename "$video_file" .mp4)

#   # Run ffmpeg command to create DASH files for each resolution and bitrate, ensuring 16:9 aspect ratio with black padding if necessary
#   ffmpeg -i "$video_file" \
#     -map 0:v -b:v:0 254k -vf "scale=320:-1:force_original_aspect_ratio=decrease, pad=320:180:(ow-iw)/2:(oh-ih)/2" \
#     -map 0:v -b:v:1 507k -vf "scale=320:-1:force_original_aspect_ratio=decrease, pad=320:180:(ow-iw)/2:(oh-ih)/2" \
#     -map 0:v -b:v:2 759k -vf "scale=480:-1:force_original_aspect_ratio=decrease, pad=480:270:(ow-iw)/2:(oh-ih)/2" \
#     -map 0:v -b:v:3 1013k -vf "scale=640:-1:force_original_aspect_ratio=decrease, pad=640:360:(ow-iw)/2:(oh-ih)/2" \
#     -map 0:v -b:v:4 1254k -vf "scale=640:-1:force_original_aspect_ratio=decrease, pad=640:360:(ow-iw)/2:(oh-ih)/2" \
#     -map 0:v -b:v:5 1883k -vf "scale=768:-1:force_original_aspect_ratio=decrease, pad=768:432:(ow-iw)/2:(oh-ih)/2" \
#     -map 0:v -b:v:6 3134k -vf "scale=1024:-1:force_original_aspect_ratio=decrease, pad=1024:576:(ow-iw)/2:(oh-ih)/2" \
#     -map 0:v -b:v:7 4952k -vf "scale=1280:-1:force_original_aspect_ratio=decrease, pad=1280:720:(ow-iw)/2:(oh-ih)/2" \
#     -seg_duration 10 \
#     -init_seg_name "${video_name}_init_\$RepresentationID\$.m4s" \
#     -media_seg_name "${video_name}_chunk_\$Bandwidth\$_\$Number\$.m4s" \
#     -use_template 1 -use_timeline 1 \
#     -f dash "media_new/${video_name}_output.mpd"

# done
#!/bin/bash

#!/bin/bash

# Iterate over each .mp4 file in the videos directory
for video_file in videos/*.mp4; do
  # Extract the video file name without the extension
  video_name=$(basename "$video_file" .mp4)

  # Get video dimensions
  dimensions=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$video_file")
  IFS='x' read -r width height <<< "$dimensions"

  # Run ffmpeg command for each resolution and bitrate
  ffmpeg -i "$video_file" \
    -map 0:v -b:v:0 254k -vf "scale=320:-1:force_original_aspect_ratio=decrease$( [ "$width" -gt 320 ] && [ "$height" -gt 180 ] && echo "" || echo ", pad=320:180:(ow-iw)/2:(oh-ih)/2" )" \
    -map 0:v -b:v:1 507k -vf "scale=320:-1:force_original_aspect_ratio=decrease$( [ "$width" -gt 320 ] && [ "$height" -gt 180 ] && echo "" || echo ", pad=320:180:(ow-iw)/2:(oh-ih)/2" )" \
    -map 0:v -b:v:2 759k -vf "scale=480:-1:force_original_aspect_ratio=decrease$( [ "$width" -gt 480 ] && [ "$height" -gt 270 ] && echo "" || echo ", pad=480:270:(ow-iw)/2:(oh-ih)/2" )" \
    -map 0:v -b:v:3 1013k -vf "scale=640:-1:force_original_aspect_ratio=decrease$( [ "$width" -gt 640 ] && [ "$height" -gt 360 ] && echo "" || echo ", pad=640:360:(ow-iw)/2:(oh-ih)/2" )" \
    -map 0:v -b:v:4 1254k -vf "scale=640:-1:force_original_aspect_ratio=decrease$( [ "$width" -gt 640 ] && [ "$height" -gt 360 ] && echo "" || echo ", pad=640:360:(ow-iw)/2:(oh-ih)/2" )" \
    -map 0:v -b:v:5 1883k -vf "scale=768:-1:force_original_aspect_ratio=decrease$( [ "$width" -gt 768 ] && [ "$height" -gt 432 ] && echo "" || echo ", pad=768:432:(ow-iw)/2:(oh-ih)/2" )" \
    -map 0:v -b:v:6 3134k -vf "scale=1024:-1:force_original_aspect_ratio=decrease$( [ "$width" -gt 1024 ] && [ "$height" -gt 576 ] && echo "" || echo ", pad=1024:576:(ow-iw)/2:(oh-ih)/2" )" \
    -map 0:v -b:v:7 4952k -vf "scale=1280:-1:force_original_aspect_ratio=decrease$( [ "$width" -gt 1280 ] && [ "$height" -gt 720 ] && echo "" || echo ", pad=1280:720:(ow-iw)/2:(oh-ih)/2" )" \
    -seg_duration 10 \
    -init_seg_name "${video_name}_init_\$RepresentationID\$.m4s" \
    -media_seg_name "${video_name}_chunk_\$Bandwidth\$_\$Number\$.m4s" \
    -use_template 1 -use_timeline 1 \
    -f dash "media_new/${video_name}_output.mpd"
done
