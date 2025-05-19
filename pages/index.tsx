import { useEffect, useState } from "react";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  increment,
} from "firebase/firestore";
import { auth, db } from "../utils/firebase";

const provider = new GoogleAuthProvider();

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [card, setCard] = useState<string[][]>([]);
  const [confirmedEvents, setConfirmedEvents] = useState<string[]>([]);
  const [allEvents, setAllEvents] = useState<string[]>([]);
  const [bingoLines, setBingoLines] = useState<number>(0);
  const [newEventName, setNewEventName] = useState("");
  const [newOutcomes, setNewOutcomes] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [eventDocs, setEventDocs] = useState<any[]>([]);
  const [validatedEvents, setValidatedEvents] = useState<string[]>([]);
  const [eventRequests, setEventRequests] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      if (u) {
        setUser(u);
        setIsAdmin(u.email === "andrzej.winokur@gmail.com");

        const userRef = doc(db, "players", u.uid);
        const userSnap = await getDoc(userRef);

        onSnapshot(collection(db, "events"), (snapshot) => {
          const all = snapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((e: any) => Array.isArray(e.value) && e.value.length);
          setEventDocs(all);
          setAllEvents(all.map((e: any) => e.value).flat());
        });

        onSnapshot(doc(db, "validated", "events"), (snap) => {
          if (snap.exists()) {
            setValidatedEvents(snap.data().values || []);
          }
        });

        onSnapshot(collection(db, "eventRequests"), (snapshot) => {
          const reqs = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          setEventRequests(reqs);
        });

        if (userSnap.exists()) {
          const data = userSnap.data();
          setCard(unflattenCard(data.card));
          setConfirmedEvents(data.confirmedEvents || []);
        } else {
          const eventsSnap = await getDocs(collection(db, "events"));
          const rawEvents = eventsSnap.docs.map(
            (doc) => doc.data()?.value || []
          );
          const events = rawEvents
            .flat()
            .filter((v): v is string => typeof v === "string");
          const flatCard = shuffle(events).slice(0, 25);

          await setDoc(userRef, {
            card: flatCard,
            confirmedEvents: [],
          });

          setCard(unflattenCard(flatCard));
        }
      } else {
        setUser(null);
        setCard([]);
        setConfirmedEvents([]);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const checkBingo = () => {
      let lines = 0;
      const checkLine = (line: string[]) =>
        line.every((val) => confirmedEvents.includes(val));

      for (let i = 0; i < 5; i++) {
        if (checkLine(card[i])) {
          lines++;
        }
        if (checkLine(card.map((row) => row[i]))) lines++; // столбцы
      }
      if (checkLine(card.map((row, i) => row[i]))) lines++; // главная диагональ
      if (checkLine(card.map((row, i) => row[4 - i]))) lines++; // побочная диагональ

      setBingoLines(lines);
    };

    if (card.length > 0) {
      checkBingo();
    }
  }, [confirmedEvents, card]);

  const flattenCard = (card: string[][]): string[] => card.flat();
  const unflattenCard = (flat: string[]): string[][] => {
    const result = [];
    for (let i = 0; i < 5; i++) {
      result.push(flat.slice(i * 5, i * 5 + 5));
    }
    return result;
  };

  const toggleEvent = async (value: string) => {
    if (!user) return;

    if (!validatedEvents.includes(value)) {
      const ref = doc(db, "eventRequests", value);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, {
          count: increment(1),
          requestedBy: user.displayName || "Анонимный игрок",
        });
      } else {
        await setDoc(ref, {
          value,
          count: 1,
          requestedBy: user.displayName || "Анонимный игрок",
        });
      }
      alert("Ожидает подтверждения админом");
      return;
    }

    const ref = doc(db, "players", user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    let updated = [...(data.confirmedEvents || [])];
    if (updated.includes(value)) {
      updated = updated.filter((v) => v !== value);
    } else {
      updated.push(value);
    }
    await updateDoc(ref, { confirmedEvents: updated });
    setConfirmedEvents(updated);
  };

  const createNewEvent = async () => {
    if (!newEventName || !newOutcomes) return;
    const outcomes = newOutcomes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    await addDoc(collection(db, "events"), {
      name: newEventName,
      value: outcomes,
    });
    setNewEventName("");
    setNewOutcomes("");
  };

  const deleteEvent = async (id: string) => {
    await deleteDoc(doc(db, "events", id));
  };

  const toggleValidation = async (event: string) => {
    const ref = doc(db, "validated", "events");
    const snap = await getDoc(ref);
    let current = snap.exists() ? snap.data().values || [] : [];
    if (current.includes(event)) {
      current = current.filter((e: string) => e !== event);
    } else {
      current.push(event);
    }
    await setDoc(ref, { values: current });
    await deleteDoc(doc(db, "eventRequests", event));
  };

  return (
    <div style={{ padding: 20 }}>
      {!user ? (
        <button onClick={() => signInWithPopup(auth, provider)}>
          Войти через Google
        </button>
      ) : (
        <div>
          <div style={{ marginBottom: 10 }}>
            <span>Привет, {user.displayName} </span>
            <button onClick={() => signOut(auth)}>Выйти</button>
          </div>

          {isAdmin && (
            <div style={{ marginBottom: 20 }}>
              <h3>Админка — создать событие</h3>
              <input
                value={newEventName}
                onChange={(e) => setNewEventName(e.target.value)}
                placeholder="Название события"
              />
              <input
                value={newOutcomes}
                onChange={(e) => setNewOutcomes(e.target.value)}
                placeholder="Исходы через запятую"
              />
              <button onClick={createNewEvent}>Создать</button>

              <h4 style={{ marginTop: 20 }}>Список событий:</h4>
              {eventDocs.map((e) => (
                <div key={e.id} style={{ marginBottom: 10 }}>
                  <strong>{e.name}</strong>
                  <ul>
                    {e.value.map((v: string) => (
                      <li key={v}>
                        <label>
                          <input
                            type="checkbox"
                            checked={validatedEvents.includes(v)}
                            onChange={() => toggleValidation(v)}
                          />{" "}
                          {v}
                        </label>
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => deleteEvent(e.id)}>
                    Удалить событие
                  </button>
                </div>
              ))}

              <h4>Запросы на валидацию:</h4>
              {eventRequests.map((r) => (
                <div key={r.id}>
                  <button onClick={() => toggleValidation(r.value)}>
                    ✅ Подтвердить
                  </button>{" "}
                  {r.value} ({r.count}) - запросил {r.requestedBy}
                </div>
              ))}
            </div>
          )}

          <h2>Моя бинго-карта</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 5,
            }}
          >
            {card.flat().map((val, i) => (
              <div
                key={i}
                onClick={() => toggleEvent(val)}
                style={{
                  padding: 10,
                  border: "1px solid #ccc",
                  backgroundColor: confirmedEvents.includes(val)
                    ? "#a0f0a0"
                    : "#f0f0f0",
                  cursor: "pointer",
                  opacity: validatedEvents.includes(val) ? 1 : 0.5,
                }}
              >
                {val}
              </div>
            ))}
          </div>

          {bingoLines > 0 && <h3>🎉 У тебя бинго! Линий: {bingoLines}</h3>}
        </div>
      )}
    </div>
  );
}

function shuffle(array: string[]): string[] {
  return array
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
}
