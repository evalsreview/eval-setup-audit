# Synthetic fixture, not a real project.
from openai import OpenAI
client = OpenAI()
ev = client.evals.create(name="support-bot", data_source_config={"type": "custom"}, testing_criteria=[])
client.evals.runs.create(ev.id, data_source={})
