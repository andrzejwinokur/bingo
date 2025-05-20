"use client";
import { useEffect, useState, Fragment } from "react";
import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  User,
} from "firebase/auth";
import {
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
  QuerySnapshot,
  DocumentData,
  DocumentSnapshot,
} from "firebase/firestore";
import { auth, db } from "../utils/firebase";

const provider = new GoogleAuthProvider();

type EventDoc = {
  id: string;
  name: string;
  value: string[];
};

type EventRequest = {
  id: string;
  value: string;
  count: number;
  requestedBy: string;
};

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [card, setCard] = useState<string[][]>([]);
  const [confirmedEvents, setConfirmedEvents] = useState<string[]>([]);
  const [bingoLines, setBingoLines] = useState<number>(0);
  const [newEventName, setNewEventName] = useState("");
  const [newOutcomes, setNewOutcomes] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [eventDocs, setEventDocs] = useState<EventDoc[]>([]);
  const [validatedEvents, setValidatedEvents] = useState<string[]>([]);
  const [eventRequests, setEventRequests] = useState<EventRequest[]>([]);
  const [showPendingModal, setShowPendingModal] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (u: User | null) => {
      if (u) {
        setUser(u);
        setIsAdmin(u.email === "andrzej.winokur@gmail.com");

        const userRef = doc(db, "players", u.uid);
        const userSnap = await getDoc(userRef);

        onSnapshot(
          collection(db, "events"),
          (snapshot: QuerySnapshot<DocumentData>) => {
            const all = snapshot.docs
              .map((doc: DocumentData) => ({ id: doc.id, ...doc.data() }))
              .filter(
                (e): e is EventDoc =>
                  Array.isArray(e.value) &&
                  e.value.length > 0 &&
                  typeof e.name === "string"
              );
            setEventDocs(all);
          }
        );

        onSnapshot(
          doc(db, "validated", "events"),
          (snap: DocumentSnapshot<DocumentData>) => {
            if (snap.exists()) {
              setValidatedEvents(snap.data()?.values || []);
            }
          }
        );

        onSnapshot(
          collection(db, "eventRequests"),
          (snapshot: QuerySnapshot<DocumentData>) => {
            const reqs = snapshot.docs.map((doc: DocumentData) => ({
              id: doc.id,
              ...doc.data(),
            }));
            setEventRequests(reqs);
          }
        );

        if (userSnap.exists()) {
          const data = userSnap.data();
          setCard(unflattenCard(data.card));
          setConfirmedEvents(data.confirmedEvents || []);
        } else {
          const eventsSnap = await getDocs(collection(db, "events"));
          const rawEvents = eventsSnap.docs.map(
            (doc: DocumentData) => doc.data()?.value || []
          );
          const events = rawEvents
            .flat()
            .filter((v: unknown): v is string => typeof v === "string");
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
      setShowPendingModal(true);
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

  const cancelValidationRequest = async (event: string) => {
    await deleteDoc(doc(db, "eventRequests", event));
  };

  return (
    <Fragment>
      {/* Попап ожидания подтверждения */}
      {showPendingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            className={`bg-white rounded-xl shadow-xl p-6 max-w-xs w-full flex flex-col items-center
            transition-all duration-300
            ${showPendingModal ? "scale-100 opacity-100" : "scale-95 opacity-0"}
          `}
          >
            <div className="text-3xl mb-2">⏳</div>
            <div className="text-black font-bold text-lg text-center mb-2">
              Ожидает подтверждения админом
            </div>
            <button
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow"
              onClick={() => setShowPendingModal(false)}
            >
              Ок
            </button>
          </div>
        </div>
      )}
      <div className="min-h-screen bg-gradient-to-br from-blue-100 to-green-100 flex items-center justify-center p-2 sm:p-6">
        <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl p-4 sm:p-8">
          {!user ? (
            <button
              className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow transition mb-4 text-lg"
              onClick={() => signInWithPopup(auth, provider)}
            >
              Войти через Google
            </button>
          ) : (
            <div>
              <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-2">
                <span className="text-lg font-semibold text-gray-700">
                  Привет, {user.displayName}
                </span>
                <button
                  className="py-2 px-4 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold shadow transition"
                  onClick={() => signOut(auth)}
                >
                  Выйти
                </button>
              </div>

              {isAdmin && (
                <div className="mb-8 border border-blue-200 rounded-xl p-4 bg-blue-50">
                  <h3 className="text-xl font-bold mb-4 text-blue-700">
                    Админка — создать событие
                  </h3>
                  <div className="flex flex-col sm:flex-row gap-2 mb-2">
                    <input
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={newEventName}
                      onChange={(e) => setNewEventName(e.target.value)}
                      placeholder="Название события"
                    />
                    <input
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                      value={newOutcomes}
                      onChange={(e) => setNewOutcomes(e.target.value)}
                      placeholder="Исходы через запятую"
                    />
                    <button
                      className="py-2 px-4 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold shadow transition"
                      onClick={createNewEvent}
                    >
                      Создать
                    </button>
                  </div>

                  <h4 className="mt-6 mb-2 text-lg font-semibold text-blue-600">
                    Список событий:
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {eventDocs.map((e) => (
                      <div
                        key={e.id}
                        className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm"
                      >
                        <strong className="text-blue-700">{e.name}</strong>
                        <ul className="mt-2 mb-2">
                          {e.value.map((v: string) => (
                            <li key={v} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={validatedEvents.includes(v)}
                                onChange={() => toggleValidation(v)}
                                className="accent-blue-600 w-4 h-4"
                              />
                              <span className="text-gray-700">{v}</span>
                            </li>
                          ))}
                        </ul>
                        <button
                          className="py-1 px-3 bg-red-100 hover:bg-red-200 text-red-700 rounded shadow-sm text-sm"
                          onClick={() => deleteEvent(e.id)}
                        >
                          Удалить событие
                        </button>
                      </div>
                    ))}
                  </div>

                  <h4 className="mt-6 mb-2 text-lg font-semibold text-blue-600">
                    Запросы на валидацию:
                  </h4>
                  <div className="flex flex-col gap-2">
                    {eventRequests.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg p-2"
                      >
                        <button
                          className="py-1 px-3 bg-green-500 hover:bg-green-600 text-white rounded shadow-sm text-sm"
                          onClick={() => toggleValidation(r.value)}
                        >
                          ✅ Подтвердить
                        </button>
                        <button
                          className="py-1 px-3 bg-red-200 hover:bg-red-300 text-red-700 rounded shadow-sm text-sm"
                          onClick={() => cancelValidationRequest(r.value)}
                        >
                          Отменить
                        </button>
                        <span className="text-gray-800">
                          {r.value} ({r.count}) - запросил {r.requestedBy}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <h2 className="text-2xl font-bold text-center mb-4 text-green-700">
                Моя бинго-карта
              </h2>
              <div className="grid grid-cols-5 grid-rows-5 gap-2 sm:gap-4 mb-6 w-full">
                {card.flat().map((val, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleEvent(val)}
                    className={`
                      select-none text-center flex items-center justify-center aspect-square w-full h-full rounded-xl shadow-md cursor-pointer font-semibold text-xs sm:text-base transition-all border-2 outline-none focus:ring-2 focus:ring-blue-400
                      ${
                        confirmedEvents.includes(val)
                          ? "bg-gradient-to-br from-green-300 to-green-500 border-green-600 text-green-900 scale-105"
                          : "bg-gradient-to-br from-gray-100 to-gray-200 border-gray-300 text-gray-700 hover:bg-blue-100 hover:border-blue-400"
                      }
                      ${
                        validatedEvents.includes(val)
                          ? "opacity-100"
                          : "opacity-50"
                      }
                      transition-transform duration-200
                      active:scale-95
                      ${confirmedEvents.includes(val) ? "animate-pulse" : ""}
                    `}
                  >
                    <span className="block w-full break-words leading-tight px-1">
                      {val}
                    </span>
                  </button>
                ))}
              </div>

              {bingoLines > 0 && (
                <h3 className="text-xl text-center font-bold text-pink-600 animate-bounce mb-2">
                  🎉 У тебя бинго! Линий: {bingoLines}
                </h3>
              )}
            </div>
          )}
        </div>
      </div>
    </Fragment>
  );
}

function shuffle(array: string[]): string[] {
  return array
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
}
