from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace


os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.natural_sort import sort_paths_naturally, sort_source_files_naturally


class NaturalSortTests(unittest.TestCase):
    def test_statement_filenames_sort_by_leading_number(self) -> None:
        filenames = [
            "10 HCBT Statement August 2024.pdf",
            "11 HCBT Statement Sept 2024.pdf",
            "12 HCBT Statement Oct 2024.pdf",
            "13 HCBT Statement Nov 2024.pdf",
            "14 HCBT Stmt December 2024.pdf",
            "15 HCBT Stmt January 2025.pdf",
            "16 HCBT Stmt February 2025.pdf",
            "17 HCBT Statment March 2025.pdf",
            "18 HCBT Statement April 2025.pdf",
            "19 HCBT Statement May 2025.pdf",
            "1 November 2023 HCBT STMT.pdf",
            "20 HCBT Statement June 2025.pdf",
            "21 HCBT Statement July 2025.pdf",
            "22 HCBT Statement August 2025.pdf",
            "23 HCBT Statement Sept 2025.pdf",
            "24 HCBT Statement Oct 2025.pdf",
            "2 December 2023 HCBT Stmt.pdf",
            "3 January 2024 HCBT STMT.pdf",
            "4 February 2024 HCBT STMT.pdf",
            "5 HCBT Stmt March 2024.pdf",
            "6 HCBT Statement April 2024.pdf",
            "7 HCBT Statement May 2024.pdf",
            "8 HCBT Statement June 2024.pdf",
            "9 HCBT Statement July 2024.pdf",
        ]

        sorted_filenames = sort_paths_naturally(filenames)

        self.assertEqual(
            sorted_filenames,
            [
                "1 November 2023 HCBT STMT.pdf",
                "2 December 2023 HCBT Stmt.pdf",
                "3 January 2024 HCBT STMT.pdf",
                "4 February 2024 HCBT STMT.pdf",
                "5 HCBT Stmt March 2024.pdf",
                "6 HCBT Statement April 2024.pdf",
                "7 HCBT Statement May 2024.pdf",
                "8 HCBT Statement June 2024.pdf",
                "9 HCBT Statement July 2024.pdf",
                "10 HCBT Statement August 2024.pdf",
                "11 HCBT Statement Sept 2024.pdf",
                "12 HCBT Statement Oct 2024.pdf",
                "13 HCBT Statement Nov 2024.pdf",
                "14 HCBT Stmt December 2024.pdf",
                "15 HCBT Stmt January 2025.pdf",
                "16 HCBT Stmt February 2025.pdf",
                "17 HCBT Statment March 2025.pdf",
                "18 HCBT Statement April 2025.pdf",
                "19 HCBT Statement May 2025.pdf",
                "20 HCBT Statement June 2025.pdf",
                "21 HCBT Statement July 2025.pdf",
                "22 HCBT Statement August 2025.pdf",
                "23 HCBT Statement Sept 2025.pdf",
                "24 HCBT Statement Oct 2025.pdf",
            ],
        )

    def test_nested_paths_and_source_files_sort_naturally(self) -> None:
        source_files = [
            SimpleNamespace(id="c", original_path="Folder 10/file 1.pdf", original_filename="file 1.pdf"),
            SimpleNamespace(id="a", original_path="Folder 2/file 10.pdf", original_filename="file 10.pdf"),
            SimpleNamespace(id="b", original_path="Folder 2/file 2.pdf", original_filename="file 2.pdf"),
        ]

        sorted_source_files = sort_source_files_naturally(source_files)

        self.assertEqual(
            [source_file.original_path for source_file in sorted_source_files],
            ["Folder 2/file 2.pdf", "Folder 2/file 10.pdf", "Folder 10/file 1.pdf"],
        )


if __name__ == "__main__":
    unittest.main()
