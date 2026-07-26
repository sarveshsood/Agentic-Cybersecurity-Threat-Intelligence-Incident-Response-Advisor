rule DemoMalware
{
    meta:
        description = "Synthetic test YARA"
    strings:
        $a = "evil_payload_marker"
    condition:
        $a
}
