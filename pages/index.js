import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { generateAnswer, calculateAB, validateGuess } from '../utils/gameLogic';
import { db } from '../lib/firebase';
import { ref, onValue, set, push, get, update, onDisconnect, serverTimestamp, remove } from 'firebase/database';

const Index = () => {
  const [answer, setAnswer] = useState('');
  const [guess, setGuess] = useState('');
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [gameOver, setGameOver] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [inRoom, setInRoom] = useState(false);
  const [playerId, setPlayerId] = useState('');
  const [digitCount, setDigitCount] = useState(4);
  const [marks, setMarks] = useState(Array(10).fill('none'));
  const [wordMarks, setWordMarks] = useState(Array(26).fill('none'));
  const [sorter, setSorter] = useState(Array(5).fill(''));
  const [activeSlot, setActiveSlot] = useState(null);
  const [dbStatus, setDbStatus] = useState('checking');
  const [playerName, setPlayerName] = useState('');
  const [players, setPlayers] = useState({});
  const [winnerName, setWinnerName] = useState('');
  const [hostId, setHostId] = useState('');
  const [showHistory, setShowHistory] = useState(true);
  const [gameMode, setGameMode] = useState('shared');
  const [gameType, setGameType] = useState('number');
  const [dictionary, setDictionary] = useState([]);
  const [chat, setChat] = useState([]);
  const [chatMsg, setChatMsg] = useState('');
  const chatBottomRef = React.useRef(null);

  useEffect(() => {
    if (db) setDbStatus('connected');
    else setDbStatus('disconnected');
    
    // 載入英文字典
    fetch('https://raw.githubusercontent.com/charlesreid1/five-letter-words/master/sgb-words.txt')
      .then(r => r.text())
      .then(t => setDictionary(t.toUpperCase().split('\n').filter(w => w.length === 5)));
  }, []);

  useEffect(() => {
    let id = localStorage.getItem('player_id');
    let name = localStorage.getItem('player_name');
    if (!id) {
      id = 'ID_' + Math.random().toString(36).substr(2, 5);
      localStorage.setItem('player_id', id);
    }
    setPlayerId(id);
    if (name) setPlayerName(name);
  }, []);

  useEffect(() => {
    if (!inRoom || !roomId || !db) return;

    const roomRef = ref(db, `rooms/${roomId}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) { setInRoom(false); return; }
      
      if (data.players && !data.players[playerId]) {
        alert('你已被房主踢出');
        setInRoom(false);
        return;
      }

      setAnswer(data.answer || '');
      setDigitCount(data.digitCount || 4);
      setGameType(data.gameType || 'number');

      // 房主接班人邏輯 (Host Migration)
      const currentHostId = data.hostId;
      if (data.players && currentHostId && !data.players[currentHostId]) {
        const remainingIds = Object.keys(data.players).sort();
        if (remainingIds.length > 0) {
           const nextHostId = remainingIds[0];
           if (playerId === nextHostId) {
             update(ref(db, `rooms/${roomId}`), { hostId: nextHostId });
           }
        }
      }

      setGameOver(data.status === 'finished');
      setWinnerName(data.winner || '');
      setHostId(data.hostId || '');
      setShowHistory(data.showHistory !== false);
      setGameMode(data.gameMode || 'shared');

      if (data.history) {
        let list = Object.values(data.history).reverse();
        if ((data.gameMode || 'shared') === 'private' && (data.hostId !== playerId)) {
          list = list.filter(item => item.playerId === playerId);
        }
        setHistory(list);
      } else {
        setHistory([]);
      }
      if (data.players) setPlayers(data.players);
      if (data.chat) {
        setChat(Object.values(data.chat));
      } else {
        setChat([]);
      }
    });

    return () => unsubscribe();
  }, [inRoom, roomId, playerId]);

  const handleCreateRoom = async () => {
    if (!db) return;
    const newId = Math.floor(1000 + Math.random() * 9000).toString();
    try {
      const finalAnswer = gameType === 'word' ? dictionary[Math.floor(Math.random() * dictionary.length)] : generateAnswer(digitCount);
      await set(ref(db, `rooms/${newId}`), {
        answer: finalAnswer,
        status: 'playing',
        digitCount: digitCount,
        gameMode: gameMode,
        gameType: gameType,
        hostId: playerId,
        showHistory: true,
        createdAt: serverTimestamp(),
        players: {
          [playerId]: { name: playerName || '無名戰神', id: playerId, score: 0, guessCount: 0 }
        }
      });
      setRoomId(newId);
      setInRoom(true);
    } catch (err) { setError('建立失敗'); }
  };

  const joinRoom = async (e) => {
    e.preventDefault();
    if (!playerName.trim()) return setError('請先輸入暱稱');
    if (roomId && db) {
      localStorage.setItem('player_name', playerName);
      const snap = await get(ref(db, `rooms/${roomId}`));
      if (!snap.exists()) return setError('找不到該房號');
      
      const pRef = ref(db, `rooms/${roomId}/players/${playerId}`);
      const ex = (await get(pRef)).val();
      await update(pRef, { name: playerName, id: playerId, score: ex?.score || 0, guessCount: ex?.guessCount || 0 });
      
      setInRoom(true);
    }
  };

  const handleGuess = async (e) => {
    e.preventDefault();
    if (gameOver || !inRoom) return;
    let currentGuess = guess.toUpperCase();
    
    if (gameType === 'word') {
      if (currentGuess.length !== 5) return setError('必須為 5 個字母');
      if (!dictionary.includes(currentGuess)) return setError('這不是有效的英文單字！');
    } else {
      const err = validateGuess(currentGuess, digitCount);
      if (err) return setError(err);
    }

    const { a, b } = calculateAB(answer, currentGuess);
    try {
      const roomSnap = await get(ref(db, `rooms/${roomId}`));
      const rData = roomSnap.val();
      const ps = rData.players || {};
      const mil = rData.milestones || {};
      let scoreAdd = 0; let updates = {};

      const total = a + b;
      if (!mil.m_sum3 && total >= 3) { scoreAdd += 20; updates[`milestones/m_sum3`] = { p: playerName }; }
      if (!mil.m_sum5 && total >= 5) { scoreAdd += 30; updates[`milestones/m_sum5`] = { p: playerName }; }
      if (!mil.m_a2 && a >= 2) { scoreAdd += 20; updates[`milestones/m_a2`] = { p: playerName }; }
      if (!mil.m_a3 && a >= 3) { scoreAdd += 30; updates[`milestones/m_a3`] = { p: playerName }; }

      await push(ref(db, `rooms/${roomId}/history`), { guess: currentGuess, a, b, playerId, playerName, timestamp: serverTimestamp() });

      if (a === digitCount) {
        scoreAdd += 60;
        updates['status'] = 'finished'; updates['winner'] = playerName;
        const sorted = Object.values(ps).map(p => ({ id: p.id, count: (p.id === playerId ? (p.guessCount||0)+1 : (p.guessCount||0)) })).sort((x,y)=>x.count-y.count);
        if (sorted[0]) updates[`players/${sorted[0].id}/score`] = (ps[sorted[0].id]?.score || 0) + 30 + (sorted[0].id === playerId ? scoreAdd : 0);
        if (sorted[1]) updates[`players/${sorted[1].id}/score`] = (ps[sorted[1].id]?.score || 0) + 20 + (sorted[1].id === playerId ? scoreAdd : 0);
        if (sorted[2]) updates[`players/${sorted[2].id}/score`] = (ps[sorted[2].id]?.score || 0) + 10 + (sorted[2].id === playerId ? scoreAdd : 0);
        if (!sorted.slice(0,3).some(x=>x.id===playerId)) updates[`players/${playerId}/score`] = (ps[playerId]?.score||0)+scoreAdd;
      } else if (scoreAdd > 0) {
        updates[`players/${playerId}/score`] = (ps[playerId]?.score || 0) + scoreAdd;
      }
      updates[`players/${playerId}/guessCount`] = (ps[playerId]?.guessCount || 0) + 1;
      await update(ref(db, `rooms/${roomId}`), updates);
      setGuess(''); setError('');
    } catch (err) { setError('傳送失敗'); }
  };

  const toggleHistory = async () => {
    if (hostId === playerId) {
      await update(ref(db, `rooms/${roomId}`), { showHistory: !showHistory });
    }
  };

  const resetGame = async () => {
    if (hostId !== playerId) return;
    const nextAnswer = gameType === 'word' ? dictionary[Math.floor(Math.random() * dictionary.length)] : generateAnswer(digitCount);
    const updates = { answer: nextAnswer, status: 'playing', history: null, milestones: null };
    Object.keys(players).forEach(id => { updates[`players/${id}/guessCount`] = 0; updates[`players/${id}/score`] = 0; });
    await update(ref(db, `rooms/${roomId}`), updates);
  };

  const sendChat = async (e) => {
    e.preventDefault();
    if(!chatMsg.trim() || !inRoom) return;
    await push(ref(db, `rooms/${roomId}/chat`), {
      playerId,
      playerName: playerName || '無名',
      text: chatMsg.trim(),
      timestamp: serverTimestamp()
    });
    setChatMsg('');
  };

  useEffect(() => {
    if (chatBottomRef.current) chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans p-4 md:p-8 flex flex-col items-center">
      <Head><title>1A2B BATTLE</title></Head>
      <header className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent italic uppercase mb-2">1A2B BATTLE</h1>
        <p className="text-slate-500 text-[10px] uppercase font-black tracking-[0.3em]">房主控制權限版</p>
      </header>

      {!inRoom ? (
        <section className="w-full max-w-md bg-slate-800 rounded-3xl p-8 border border-slate-700 shadow-2xl">
           <form onSubmit={joinRoom} className="space-y-6">
              <input type="text" value={playerName} onChange={(e)=>setPlayerName(e.target.value)} placeholder="您的暱稱" className="w-full bg-slate-900 border-2 border-slate-700 rounded-2xl px-5 py-4 focus:border-cyan-500 text-white font-bold" />
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={()=>setGameType('number')} className={`py-3 rounded-xl border-2 font-black text-xs transition-all uppercase ${gameType==='number'?'bg-cyan-600 border-cyan-400 text-white shadow-lg shadow-cyan-900/40':'bg-slate-700/50 border-slate-600 text-slate-400'}`}>數字對決</button>
                <button type="button" onClick={()=>{setGameType('word'); setDigitCount(5);}} className={`py-3 rounded-xl border-2 font-black text-xs transition-all uppercase ${gameType==='word'?'bg-cyan-600 border-cyan-400 text-white shadow-lg shadow-cyan-900/40':'bg-slate-700/50 border-slate-600 text-slate-400'}`}>英文字詞</button>
              </div>
              {gameType !== 'word' && (
                <div className="grid grid-cols-3 gap-3">
                  {[3, 4, 5].map(n => (
                    <button key={n} type="button" onClick={()=>setDigitCount(n)} className={`py-3 rounded-xl border-2 font-black transition-all ${digitCount===n?'bg-cyan-600 border-cyan-400 text-white shadow-lg':'bg-slate-700/50 border-slate-600 text-slate-400'}`}>{n} 位</button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={()=>setGameMode('shared')} className={`py-3 rounded-xl border-2 font-black text-xs transition-all uppercase ${gameMode==='shared'?'bg-cyan-600 border-cyan-400 text-white shadow-lg shadow-cyan-900/40':'bg-slate-700/50 border-slate-600 text-slate-400'}`}>共享模式</button>
                <button type="button" onClick={()=>setGameMode('private')} className={`py-3 rounded-xl border-2 font-black text-xs transition-all uppercase ${gameMode==='private'?'bg-cyan-600 border-cyan-400 text-white shadow-lg shadow-cyan-900/40':'bg-slate-700/50 border-slate-600 text-slate-400'}`}>隱私模式</button>
              </div>
              <button type="button" onClick={handleCreateRoom} className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-black py-5 rounded-2xl text-xl uppercase tracking-widest shadow-xl">👑 建立房間</button>
              <div className="grid grid-cols-3 gap-3">
                <input type="text" value={roomId} onChange={(e)=>setRoomId(e.target.value)} placeholder="房號" className="col-span-2 bg-slate-900 border-2 border-slate-700 rounded-2xl p-4 text-center text-2xl font-mono text-white font-black" />
                <button type="submit" className="bg-slate-700 text-white font-black rounded-2xl border-2 border-slate-600">加入</button>
              </div>
           </form>
           {error && <p className="text-red-400 text-center mt-4 font-black">{error}</p>}
        </section>
      ) : (
        <main className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-8">
           <div className="lg:col-span-3 space-y-8 flex flex-col order-2 lg:order-1">
              <section className="bg-slate-800 rounded-[2.5rem] p-6 border border-slate-700 shadow-2xl flex flex-col h-[600px]">
                 <h3 className="text-[10px] font-black text-slate-500 mb-4 uppercase tracking-widest border-b border-slate-700 pb-3 flex items-center justify-between">
                   <span>LIVE CHAT</span>
                   <span className="text-xs bg-slate-700 px-2 rounded-full">{chat.length}</span>
                 </h3>
                 <div className="overflow-y-auto custom-scrollbar flex-grow space-y-3 mb-4 pr-1 flex flex-col">
                    {chat.map((c, i) => (
                       <div key={i} className={`flex flex-col max-w-[85%] ${c.playerId === playerId ? 'self-end items-end' : 'self-start items-start'}`}>
                          <span className="text-[8px] text-slate-500 mb-1">{c.playerName || '無名'}</span>
                          <div className={`px-4 py-2 rounded-2xl text-sm break-words ${c.playerId === playerId ? 'bg-cyan-600/80 text-white rounded-tr-sm border border-cyan-500/50' : 'bg-slate-900/80 text-white rounded-tl-sm border border-slate-700/50'}`}>
                             {c.text}
                          </div>
                       </div>
                    ))}
                    <div ref={chatBottomRef}></div>
                 </div>
                 <form onSubmit={sendChat} className="flex space-x-2 shrink-0">
                    <input type="text" value={chatMsg} onChange={(e)=>setChatMsg(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-2xl px-4 py-3 text-sm text-white focus:border-cyan-500 outline-none transition-all placeholder-slate-600" placeholder="打個招呼吧..."/>
                    <button type="submit" className="bg-gradient-to-r from-cyan-600 to-blue-500 text-white px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:shadow-cyan-500/25 active:scale-95 transition-all">傳送</button>
                 </form>
              </section>
           </div>

           <div className="lg:col-span-6 space-y-8 order-1 lg:order-2">
              <section className="bg-slate-800 rounded-[2.5rem] p-10 border border-slate-700 shadow-2xl">
                 <div className="flex justify-between items-center mb-8">
                    <div className="flex space-x-4">
                       <div className="bg-slate-950 border-2 border-slate-800 px-4 py-2 rounded-xl"><span className="text-[9px] text-slate-600 block uppercase font-black">Room</span><span className="text-cyan-400 font-mono font-black text-xl">{roomId}</span></div>
                       <div className="bg-slate-950 border-2 border-slate-800 px-4 py-2 rounded-xl"><span className="text-[9px] text-slate-600 block uppercase font-black">Mode</span><span className="text-white font-black text-xl">{digitCount} 位</span></div>
                       {hostId === playerId && (
                          <button onClick={toggleHistory} className="bg-cyan-500/10 border-2 border-cyan-500/40 px-4 py-2 rounded-xl text-[10px] font-black text-cyan-400 uppercase tracking-widest hover:bg-cyan-500 hover:text-white transition-all">
                             🕵️ 紀錄: {showHistory ? '公開' : '隱藏'}
                          </button>
                       )}
                    </div>
                    <button onClick={()=>setInRoom(false)} className="bg-red-500/10 border-2 border-red-500/40 text-red-500 px-6 py-2 rounded-xl font-black text-xs">EXIT</button>
                 </div>

                 {gameOver ? (
                    <div className="text-center py-10 bg-green-500/5 border-2 border-green-500/20 rounded-[3rem]">
                       <div className="text-7xl mb-4">🏆</div>
                       <h2 className="text-4xl font-black text-white italic uppercase">Round Over!</h2>
                       <p className="text-green-400 font-black mb-10">Winner: {winnerName}</p>
                       <div className="bg-slate-950 p-10 rounded-3xl border border-white/5 shadow-2xl mb-10 inline-block">
                          <span className="text-7xl font-mono font-black tracking-[0.3em] text-white">{answer}</span>
                       </div><br/>
                       {hostId === playerId ? (
                          <button onClick={resetGame} className="bg-white text-slate-950 px-16 py-6 rounded-full font-black text-2xl uppercase tracking-widest shadow-2xl">Next Battle</button>
                       ) : (
                          <p className="text-slate-500 italic">等待房主開啟下一局...</p>
                       )}
                    </div>
                 ) : (
                    <form onSubmit={handleGuess} className="max-w-md mx-auto space-y-12">
                       <div className="relative">
                          <input autoFocus type="text" maxLength={digitCount} value={guess} onChange={(e)=>setGuess(e.target.value.replace(gameType==='word'?/[^A-Za-z]/g:/[^0-9]/g,''))} className="w-full bg-slate-950 border-4 border-slate-800 rounded-[2.5rem] p-10 text-7xl font-mono text-center tracking-[0.4em] focus:border-cyan-500 outline-none text-white shadow-2xl transition-all" placeholder="?" />
                       </div>
                       <button type="submit" className="w-full bg-white text-slate-950 hover:bg-cyan-500 hover:text-white font-black py-8 rounded-[2.5rem] shadow-2xl text-4xl transform active:translate-y-2 transition-all uppercase tracking-widest">Submit!</button>
                       {error && <p className="text-red-400 text-center font-black animate-bounce">⚠️ {error}</p>}
                    </form>
                 )}
              </section>

              <section className="bg-slate-800/40 rounded-[2.5rem] p-8 border border-slate-800/50 backdrop-blur-xl shadow-xl space-y-10">
                <div className={gameType === 'word' ? "grid grid-cols-6 md:grid-cols-13 gap-2" : "grid grid-cols-5 md:grid-cols-10 gap-4"}>
                   {(gameType === 'word' ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split('') : [0,1,2,3,4,5,6,7,8,9]).map((label, idx) => {
                     const m = gameType === 'word' ? wordMarks[idx] : marks[idx];
                     return (
                       <button key={label} onClick={()=>{
                         const s = ['none', 'correct', 'wrong'];
                         const next = s[(s.indexOf(m)+1)%3];
                         if (gameType === 'word') {
                           const newMarks = [...wordMarks];
                           newMarks[idx] = next;
                           setWordMarks(newMarks);
                         } else {
                           const newMarks = [...marks];
                           newMarks[idx] = next;
                           setMarks(newMarks);
                         }
                       }} className={`aspect-square rounded-xl border-2 text-2xl font-black transition-all ${m==='correct'?'bg-green-500 border-green-300 text-white shadow-lg':m==='wrong'?'bg-red-500/20 border-red-900/40 text-red-900 line-through':'bg-slate-900 border-slate-700 text-slate-700'}`}>{label}</button>
                     );
                   })}
                </div>

                {/* 沙盤推演區 */}
                <div className="pt-10 border-t border-slate-700/50 space-y-10">
                   <div className="flex items-center justify-between">
                     <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">沙盤推演 (STRATEGIC DRAFTS)</span>
                     <button onClick={()=>{setSorter(Array(5).fill('')); setActiveSlot(null);}} className="text-[9px] font-black text-red-500/60 uppercase">重置排位</button>
                   </div>
                   <div className="flex justify-center space-x-2 md:space-x-4 overflow-x-auto pb-4">
                      {sorter.slice(0, digitCount).map((val, i) => (
                        <div key={i} onClick={() => setActiveSlot(activeSlot === i ? null : i)} className={`w-12 h-16 md:w-16 md:h-20 border-2 rounded-2xl flex-shrink-0 flex items-center justify-center text-3xl font-black transition-all cursor-pointer ${activeSlot === i ? 'bg-cyan-500/20 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.3)] text-white scale-110' : 'bg-slate-950/50 border-slate-700 text-cyan-400 opacity-60 hover:opacity-100'}`}>
                          {val || '?'}
                        </div>
                      ))}
                   </div>

                   {activeSlot !== null && (
                     <div className="bg-slate-900/80 p-8 rounded-[2.5rem] border-2 border-slate-700/50 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="flex justify-between items-center mb-6">
                           <span className="text-[10px] font-black text-cyan-500 uppercase tracking-widest italic">選取以放入第 {activeSlot + 1} 位</span>
                           <button onClick={()=>setActiveSlot(null)} className="text-slate-500 font-bold text-xs uppercase hover:text-white">取消</button>
                        </div>
                        <div className={gameType === 'word' ? "grid grid-cols-7 md:grid-cols-13 gap-2" : "grid grid-cols-5 md:grid-cols-10 gap-3"}>
                           {(gameType === 'word' ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split('') : [0,1,2,3,4,5,6,7,8,9]).map(v => (
                              <button key={v} onClick={() => {
                                const newSorter = [...sorter];
                                newSorter[activeSlot] = v;
                                setSorter(newSorter);
                                setActiveSlot(null);
                              }} className="aspect-square bg-slate-950 border border-slate-800 rounded-xl text-sm font-black text-slate-300 hover:bg-cyan-500 hover:text-white hover:border-cyan-300 transition-all shadow-xl">{v}</button>
                           ))}
                        </div>
                     </div>
                   )}
                </div>
              </section>
           </div>

           <div className="lg:col-span-3 space-y-8 flex flex-col order-3 lg:order-3">
              <section className="bg-slate-800 rounded-[2.5rem] p-8 border border-slate-700 shadow-2xl min-h-[400px]">
                 <h3 className="text-[10px] font-black text-slate-500 mb-8 uppercase tracking-widest border-b border-slate-700 pb-5">Ranking Board</h3>
                 <div className="space-y-4">
                    {Object.values(players).sort((a,b)=>(b.score||0)-(a.score||0)).map((p, i) => (
                      <div key={p.id} className={`p-4 rounded-3xl border-2 transition-all ${p.id===playerId?'bg-cyan-900/20 border-cyan-500/40':'bg-slate-900/50 border-slate-800/50'}`}>
                         <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-black truncate">{i===0?'👑':''} {p.name}</span>
                            <span className="text-xs font-black text-yellow-500 italic">{p.score||0} PTS</span>
                         </div>
                         <div className="flex justify-between items-center text-[9px] font-black text-slate-600">
                            <span>Guesses: {p.guessCount||0}</span>
                            {p.id === hostId ? <span className="text-indigo-400">HOST</span> : (hostId === playerId && <button onClick={()=>remove(ref(db, `rooms/${roomId}/players/${p.id}`))} className="text-red-500">Kick</button>)}
                         </div>
                      </div>
                    ))}
                 </div>
              </section>

              <section className="bg-slate-800 rounded-[2.5rem] p-8 border border-slate-700 shadow-2xl flex-1 max-h-[400px] overflow-hidden flex flex-col">
                 <h3 className="text-[10px] font-black text-slate-500 mb-8 uppercase tracking-widest border-b border-slate-700 pb-5">Battle Logs</h3>
                 <div className="overflow-y-auto custom-scrollbar flex-grow space-y-4 pr-1">
                    {!showHistory ? (
                       <div className="text-center py-20 text-slate-700 italic text-xs tracking-[0.2em] leading-relaxed animate-pulse">🕵️ 戰場靜默模式...<br/>(歷史紀錄已對所有人隱藏)</div>
                    ) : (
                      history.length === 0 ? <div className="text-center py-20 text-slate-700 italic text-xs">等待攻擊紀錄...</div> :
                      history.map((item, idx) => (
                        <div key={idx} className={`p-5 rounded-[2rem] border-2 ${item.playerId===playerId?'bg-slate-950 border-cyan-900/30':'bg-slate-950/40 border-slate-900'}`}>
                           <div className="flex justify-between items-center mb-4"><span className={`text-[9px] font-black px-3 py-1 rounded-full ${item.playerId===playerId?'bg-cyan-500 text-slate-950':'bg-slate-700 text-slate-400'}`}>{item.playerName}</span><span className="text-[9px] font-mono text-slate-800">{new Date(item.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span></div>
                           <div className="flex flex-col space-y-3"><span className="text-3xl font-black font-mono tracking-[0.2em] italic text-white">{item.guess}</span><div className="flex space-x-3"><span className="bg-cyan-500/10 border-2 border-cyan-500/50 text-cyan-400 py-3 rounded-2xl flex-1 text-center font-black">{item.a}A</span><span className="bg-blue-500/10 border-2 border-blue-500/50 text-blue-400 py-3 rounded-2xl flex-1 text-center font-black">{item.b}B</span></div></div>
                        </div>
                      ))
                    )}
                 </div>
              </section>
           </div>
        </main>
      )}

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;900&display=swap');
        body { font-family: 'Outfit', sans-serif; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default Index;
