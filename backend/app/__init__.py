# neptune_client.py / neptune_sync.py (copied verbatim from the Neptune repo)
# import each other and neptune_db with unqualified names ("import neptune_db",
# not "from app import neptune_db"), since in Neptune they're flat sibling
# files. Adding this package's own directory to sys.path lets those unqualified
# imports keep working unmodified here too.
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
