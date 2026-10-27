# Synthetic fixture, not a real project.
from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCaseParams
metric = GEval(name="quality", criteria="Is it good?", evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT])
