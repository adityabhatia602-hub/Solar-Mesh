"""Provider package: swappable data sources behind stable interfaces.

- TelemetryProvider / SimulationTelemetryProvider: device readings source.
- GridDataProvider / SimulatedGridProvider: grid topology + load state source.

Future: MQTTTelemetryProvider, UtilityGridProvider — the market engine and API
contract do not change when these are swapped in.
"""
