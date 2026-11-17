TRIAGE_MODEL = "valhalla/distilbart-mnli-12-3"
TRIAGE_REVISION = "ef9a58ce6a9cd44cd0d4c2f7db1cd67f81019a8b"
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
EMBEDDING_REVISION = "1110a243fdf4706b3f48f1d95db1a4f5529b4d41"
EMBEDDING_VERSION = EMBEDDING_MODEL + "@" + EMBEDDING_REVISION
TRIAGE_VERSION = TRIAGE_MODEL + "@" + TRIAGE_REVISION
TAXONOMY_VERSION = "it-faults-v2"
CATEGORIES = [
    "Hardware Fault",
    "OS and Software Crash",
    "Network and DHCP Connectivity",
    "Peripheral Defect",
    "Power Infrastructure",
]
CONFIDENCE_THRESHOLD = 0.50
SIMILARITY_THRESHOLD = 0.45
DIMENSIONS = 384


LABEL_DESCRIPTIONS = [
    "internal computer hardware such as memory, storage, cooling or motherboard",
    "an operating system or software application error",
    "network connections, IP addresses or DHCP",
    "an external peripheral device such as a keyboard, mouse, printer or webcam",
    "electrical power supply, power outlets, UPS or circuits",
]
