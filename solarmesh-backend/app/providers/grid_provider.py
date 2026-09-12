"""Grid data provider abstraction.

The SimulatedGridProvider reflects the digital-twin grid stored in the database
(nodes, edges, loads). A future UtilityGridProvider would expose the same
interface backed by a real DMS/SCADA feed.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from sqlalchemy.orm import Session

from app.models import GridEdge, GridNode


class GridDataProvider(ABC):
    @abstractmethod
    def get_grid_state(self, db: Session) -> dict:
        raise NotImplementedError


class SimulatedGridProvider(GridDataProvider):
    """Digital-twin grid state straight from the database models."""

    def get_grid_state(self, db: Session) -> dict:
        nodes = db.query(GridNode).order_by(GridNode.code).all()
        edges = db.query(GridEdge).all()
        return {
            "nodes": [n.to_dict() for n in nodes],
            "edges": [e.to_dict() for e in edges],
        }
