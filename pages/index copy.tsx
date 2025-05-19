import { useEffect, useState } from "react";
import { auth, db } from "../utils/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  onSnapshot,
  deleteDoc,
} from "firebase/firestore";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

export default function Home() {
  const [user, setUser] = useState(null);
  const [card, setCard] = useState<string[][]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [confirmedEvents, setConfirmedEvents] = useState<string[]>([]);
  const [validated, setValidated] = useState<{
    bingo: boolean;
    events: string[];
  }>({ bingo: false, events: [] });
  const [eventRequests, setEventRequests] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        setUser(user);
      } else {
        setUser(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "eventRequests"), (snapshot) => {
      const reqs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setEventRequests(reqs);
    });
    return () => unsub();
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const generateCard = () => {
    const sampleEvents = [...events]
      .sort(() => 0.5 - Math.random())
      .slice(0, 25);
    return sampleEvents;
  };

  const reshapeCard = (flat: string[]) => {
    const reshaped = [];
    for (let i = 0; i < 5; i++) {
      reshaped.push(flat.slice(i * 5, i * 5 + 5));
    }
    return reshaped;
  };

  const savePlayerCard = async (flatCard: string[]) => {
    await setDoc(doc(db, "players", user.uid), {
      card: flatCard,
      confirmedEvents: [],
      validated: { bingo: false, events: [] },
    });
  };

  useEffect(() => {
    const fetchEvents = async () => {
      const eventsSnap = await getDocs(collection(db, "events"));
      const values = eventsSnap.docs
        .map((doc) => doc.data().value)
        .filter(Boolean);
      setEvents(values);
    };
    fetchEvents();
  }, []);

  useEffect(() => {
    const fetchPlayerCard = async () => {
      const playerDoc = await getDoc(doc(db, "players", user.uid));
      if (playerDoc.exists()) {
        const data = playerDoc.data();
        setCard(reshapeCard(data.card));
        setConfirmedEvents(data.confirmedEvents || []);
        setValidated(data.validated || { bingo: false, events: [] });
      } else {
        const flatCard = generateCard();
        await savePlayerCard(flatCard);
        setCard(reshapeCard(flatCard));
      }
    };
    if (user) fetchPlayerCard();
  }, [user, events]);

  const toggleEvent = async (event: string) => {
    if (!confirmedEvents.includes(event)) {
      await addDoc(collection(db, "eventRequests"), {
        playerId: user.uid,
        playerName: user.displayName || "Игрок",
        event,
      });
    }
  };

  const confirmEvent = async (
    event: string,
    playerId: string,
    requestId: string
  ) => {
    const playerRef = doc(db, "players", playerId);
    const playerDoc = await getDoc(playerRef);
    if (playerDoc.exists()) {
      const data = playerDoc.data();
      const newValidated = {
        ...data.validated,
        events: [...(data.validated?.events || []), event],
      };
      const bingoAchieved = checkBingo(data.card, newValidated.events);
      newValidated.bingo = bingoAchieved;
      await updateDoc(playerRef, { validated: newValidated });
    }
    await deleteDoc(doc(db, "eventRequests", requestId));
  };

  const checkBingo = (flatCard: string[], validatedEvents: string[]) => {
    const card = reshapeCard(flatCard);
    const grid = card.map((row) => row.map((e) => validatedEvents.includes(e)));
    const checkLine = (arr: boolean[]) => arr.every(Boolean);
    for (let i = 0; i < 5; i++) {
      if (checkLine(grid[i]) || checkLine(grid.map((r) => r[i]))) return true;
    }
    if (checkLine([0, 1, 2, 3, 4].map((i) => grid[i][i]))) return true;
    if (checkLine([0, 1, 2, 3, 4].map((i) => grid[i][4 - i]))) return true;
    return false;
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {user ? (
        <>
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold">Bingo</h1>
            <button
              onClick={logout}
              className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
            >
              Logout
            </button>
          </div>

          <table className="w-full table-fixed border border-gray-400">
            <tbody>
              {card.map((row, i) => (
                <tr key={i}>
                  {row.map((event, j) => (
                    <td
                      key={j}
                      onClick={() => toggleEvent(event)}
                      className={`border p-2 text-center cursor-pointer transition-colors
                        ${
                          validated.events.includes(event)
                            ? "bg-green-300"
                            : confirmedEvents.includes(event)
                            ? "bg-blue-200"
                            : "hover:bg-gray-100"
                        }`}
                    >
                      {event}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {validated.bingo && (
            <p className="mt-4 text-green-600 font-bold">🎉 BINGO! 🎉</p>
          )}

          {user.email === "andrzej.winokur@gmail.com" && (
            <div className="mt-8">
              <h2 className="text-xl font-semibold mb-2">
                Запросы на подтверждение
              </h2>
              {eventRequests.length === 0 ? (
                <p className="text-gray-500">Нет запросов</p>
              ) : (
                <ul className="space-y-2">
                  {eventRequests.map((req) => (
                    <li
                      key={req.id}
                      className="flex items-center justify-between bg-white shadow px-4 py-2 rounded border"
                    >
                      <span>
                        <strong>{req.event}</strong> от {req.playerName}
                      </span>
                      <button
                        onClick={() =>
                          confirmEvent(req.event, req.playerId, req.id)
                        }
                        className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
                      >
                        ✅ Подтвердить
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <button
            onClick={login}
            className="bg-blue-500 text-white px-6 py-3 rounded text-lg hover:bg-blue-600"
          >
            Войти через Google
          </button>
        </div>
      )}
    </div>
  );
}
