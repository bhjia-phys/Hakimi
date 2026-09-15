---
"@bhjia-phys/hakimi": patch
---

Fix opening files and folders from the web UI on Linux systems without xdg-open by falling back to gio, resolve chat links whose filenames are percent-encoded (e.g. non-ASCII names) to the real workspace file, add original-file and containing-folder actions to failed previews, and let unsupported chat attachments and uploaded media download the original file instead of failing silently.
