from app.db import Base, SessionLocal, engine
from app.demo_data import ensure_demo_data

Base.metadata.create_all(bind=engine)
with SessionLocal() as db:
    ensure_demo_data(db)
print("Synthetische Demo-Daten geprüft.")
