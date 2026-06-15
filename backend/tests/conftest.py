import pathlib
import sys

# Make the backend root (parent of tests/) importable as the `app` package,
# so tests run regardless of the working directory. No DB / network needed.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
