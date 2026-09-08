# Local attachments and MP4 videos

Embed a local MP4 in an Obsidian note or CLI Markdown file using either syntax:

```markdown
![[assets/clip.mp4]]
![Video](assets/clip.mp4)
```

The publisher uploads the file as a Confluence attachment and references it with an ADF media group. Repeated references to the same file share an attachment, and unchanged publishing does not upload it again. Confluence controls the attachment preview and playback support.

Image-style size hints, such as `![[assets/clip.mp4|320x180]]`, are ignored for non-image attachments. They do not turn a video into an image or set the video player's dimensions. This applies to other non-image attachments too.

The integration fixture `test-fixtures/release-vault/assets/sample.mp4` is a generated one-second H.264 test pattern, with no audio or external source material. It was created with:

```sh
ffmpeg -f lavfi -i 'testsrc2=size=160x90:rate=10:duration=1' -an -c:v libx264 -pix_fmt yuv420p -movflags +faststart sample.mp4
```

The live and Obsidian integration profiles test this fixture. See [Testing](TESTING.md) for setup and commands.
