import os
import subprocess

# Specify the input directory for videos
input_dir = './videos'

# Define the output directory for manifests and chunks
manifest_dir = './media'

# Ensure the manifest and media directories exist
os.makedirs(os.path.join(manifest_dir, 'media'), exist_ok=True)

# FFmpeg command template with the correct manifest directory
ffmpeg_command_template = (
    "ffmpeg -i \"{input_file}\" "
    "-map 0:v -b:v:0 254k -s:v:0 320x180 -vf \"scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2:black\" "
    "-map 0:v -b:v:1 507k -s:v:1 320x180 -vf \"scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2:black\" "
    "-map 0:v -b:v:2 759k -s:v:2 480x270 -vf \"scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2:black\" "
    "-map 0:v -b:v:3 1013k -s:v:3 640x360 -vf \"scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2:black\" "
    "-map 0:v -b:v:4 1254k -s:v:4 640x360 -vf \"scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2:black\" "
    "-map 0:v -b:v:5 1883k -s:v:5 768x432 -vf \"scale=768:432:force_original_aspect_ratio=decrease,pad=768:432:(ow-iw)/2:(oh-ih)/2:black\" "
    "-map 0:v -b:v:6 3134k -s:v:6 1024x576 -vf \"scale=1024:576:force_original_aspect_ratio=decrease,pad=1024:576:(ow-iw)/2:(oh-ih)/2:black\" "
    "-map 0:v -b:v:7 4952k -s:v:7 1280x720 -vf \"scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black\" "
    "-use_template 1 -use_timeline 1 -seg_duration 10 "
    "-init_seg_name \"media/{video_name}_init_\\$RepresentationID\\$.m4s\" "
    "-media_seg_name \"media/{video_name}_chunk_\\$Bandwidth\\$_\\$Number\\$.m4s\" "
    "-adaptation_sets id=0,streams=v "
    "-f dash \"{output_file}\""
)

# Process each video file in the input directory
for filename in os.listdir(input_dir):
    if filename.endswith(".mp4"):  # Ensure it's a video file
        input_file = os.path.join(input_dir, filename)
        video_name = filename.split('.')[0]

        # Generate the output .mpd file path in the manifest directory
        output_file = os.path.join(manifest_dir, video_name + '.mpd')

        # Check if the manifest already exists to avoid reprocessing
        # if os.path.isfile(output_file):
        #     print(f"Manifest already exists for {filename}. Skipping.")
        #     continue

        # Construct the FFmpeg command for DASH manifest generation
        ffmpeg_command = ffmpeg_command_template.format(
            input_file=input_file, video_name=video_name, output_file=output_file
        )

        # Execute the FFmpeg command for DASH manifest generation
        print(f"Processing video: {filename}")
        result = subprocess.run(ffmpeg_command, shell=True)

        # Check for errors during FFmpeg processing
        if result.returncode != 0:
            print(f"Error processing {filename}")
        else:
            print(f"Successfully processed: {filename}")

print("All videos processed.")