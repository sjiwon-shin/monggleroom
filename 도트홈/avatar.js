/* 도트홈 — 픽셀 캐릭터 조합 모듈 (parts.js 가 먼저 로드되어야 합니다)
   캐릭터 코드 형식: "2:헤어.얼굴.옷.머리색.피부색.옷색.안경.모자"
   부품 그림은 머리=빨강, 옷=파랑 임시색으로 그려져 있고, 여기서 고른 색으로 바꿉니다. */
(function(){
"use strict";
var P2 = window.PG_PARTS || null;
var HAIR2  = ["#1B1A1F","#3A2A22","#5E4030","#7A4A3A","#B98A3E","#D9C08E","#8E9197","#ECEAE6"];
var SKIN2  = ["#FBE3CF","#EEC6A0","#CF9B6C","#9C6B4A"];
var CLOTH2 = ["#25324F","#2B2B30","#7F8FA8","#F2F1EE","#D9485B","#F2A7B8","#F2C94C","#4C9F70",
              "#3FB7AE","#4C8DF0","#8E5BD6","#8A6242"];
var partImgs = {}, partsReadyP = null, partsLoaded = false;
function partsReady(){
  if (partsReadyP) return partsReadyP;
  if (!P2) return (partsReadyP = Promise.resolve(false));
  var list = [["head", P2.head]];
  ["hair","face","cloth","glasses","hat"].forEach(function(k){
    P2[k].forEach(function(p, i){ if (p.layer) list.push([k + i, p.layer]); });
  });
  partsReadyP = Promise.all(list.map(function(e){
    return new Promise(function(res){
      var im = new Image();
      im.onload = function(){ partImgs[e[0]] = im; res(); };
      im.onerror = function(){ res(); };
      im.src = "data:image/png;base64," + e[1].png;
    });
  })).then(function(){ partsLoaded = true; return true; });
  return partsReadyP;
}
function isV2(a){ return typeof a === "string" && a.indexOf("2:") === 0; }
/* 형식: "2:헤어.얼굴.옷.머리색.피부색.옷색.안경.모자" (뒤의 두 칸은 없으면 0) */
function parseAv2(a){
  var p = String(a || "").slice(2).split(".");
  function cl(v, n){ v = parseInt(v, 10); return (v >= 0 && v < n) ? v : 0; }
  function n(k){ return (P2 && P2[k]) ? P2[k].length : 1; }
  return { v:2, h:cl(p[0],n("hair")), f:cl(p[1],n("face")), c:cl(p[2],n("cloth")),
           hc:cl(p[3],HAIR2.length), sk:cl(p[4],SKIN2.length), cc:cl(p[5],CLOTH2.length),
           g:cl(p[6],n("glasses")), t:cl(p[7],n("hat")) };
}
function makeAv2(o){ return "2:" + [o.h,o.f,o.c,o.hc,o.sk,o.cc,o.g||0,o.t||0].join("."); }
function randAv2(){
  function r(n){ return Math.floor(Math.random()*n); }
  var guestClothes = [];
  P2.cloth.forEach(function(part, i){ if (!part.couple) guestClothes.push(i); });
  return makeAv2({ h:r(P2.hair.length), f:r(P2.face.length), c:guestClothes[r(guestClothes.length)],
                   hc:r(HAIR2.length), sk:r(SKIN2.length), cc:r(CLOTH2.length),
                   g: Math.random() < 0.25 ? r(P2.glasses.length) : 0,     // 안경·모자는 가끔만
                   t: Math.random() < 0.15 ? r(P2.hat.length) : 0 });
}
function hex2rgb(h){ var n = parseInt(h.slice(1),16); return [n>>16, (n>>8)&255, n&255]; }
function hsl(r,g,b){
  r/=255; g/=255; b/=255;
  var mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2, d=mx-mn, h=0, s=0;
  if (d > 1e-6){
    s = d / (1 - Math.abs(2*l-1));
    if (mx===r) h = ((g-b)/d) % 6; else if (mx===g) h = (b-r)/d + 2; else h = (r-g)/d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h,s,l];
}
var cache2 = {}, cache2n = 0;
/* 안경은 투명 렌즈와 도트 테두리만 그립니다. 추출 이미지에 섞인 눈/피부는 사용하지 않습니다. */
function drawGlasses2(ctx, style){
  if (!style) return;
  var round = style === 1;
  var inset = round ? [5,3,2,1,1,0,0,0,0,0,0,1,1,2,3,5] :
                      [2,1,0,0,0,0,0,0,0,0,0,0,0,0,1,2];
  ctx.fillStyle = "#30251F";
  [59,81].forEach(function(left){
    for (var y=0; y<inset.length; y++){
      for (var x=inset[y]; x<18-inset[y]; x++){
        if (y===0 || y===inset.length-1 || x===inset[y] || x===17-inset[y] ||
            x<inset[y-1] || x>=18-inset[y-1] || x<inset[y+1] || x>=18-inset[y+1]){
          ctx.fillRect(left+x,40+y,1,1);
          /* 렌즈 안쪽은 유지하고 바깥쪽으로 한 도트만 두껍게 합니다. */
          [[-1,0],[1,0],[0,-1],[0,1]].forEach(function(offset){
            var nx=x+offset[0], ny=y+offset[1];
            if (ny<0 || ny>=inset.length || nx<inset[ny] || nx>=18-inset[ny])
              ctx.fillRect(left+nx,40+ny,1,1);
          });
        }
      }
    }
  });
  ctx.fillRect(77,46,4,2);  // 코받침 연결
  ctx.fillRect(56,45,3,2); ctx.fillRect(99,45,3,2);  // 양쪽 안경다리
}
/* 조합 결과(여백을 자른 캔버스)를 돌려줍니다. 부품이 아직 안 읽혔으면 null */
function compose2(avatar){
  if (!P2) return null;
  var c = cache2[avatar]; if (c) return c;
  /* 부품 그림이 전부 읽히기 전에 조합하면 머리카락·옷이 빠진 채 캐시에 박히므로, 다 읽힌 뒤에만 조합 */
  if (!partsLoaded) { partsReady(); return null; }
  if (cache2n > 400) { cache2 = {}; cache2n = 0; }   // 메모리 보호
  var o = parseAv2(avatar), N = P2.canvas;
  var cv = document.createElement("canvas"); cv.width = cv.height = N;
  var x = cv.getContext("2d");
  function put(key, L){ var im = partImgs[key]; if (im && L) x.drawImage(im, L.x, L.y); }
  var HC = hex2rgb(HAIR2[o.hc]), SC = hex2rgb(SKIN2[o.sk]), CC = hex2rgb(CLOTH2[o.cc]);
  function tint(d, i, T, l, ref){
    var f = l / ref;
    d[i]   = Math.max(0, Math.min(255, T[0]*f));
    d[i+1] = Math.max(0, Math.min(255, T[1]*f));
    d[i+2] = Math.max(0, Math.min(255, T[2]*f));
  }
  /* 1) 머리(민머리) → 옷 → 얼굴 을 그리고, 파랑→옷색 · 살색→피부색 으로 바꿉니다 */
  put("head", P2.head);
  /* 바탕 머리에 남은 원래 눈의 가장자리를 지우고 선택한 표정만 올립니다.
     귀·머리 외곽선은 보호하고, 얼굴 부품 안쪽의 눈/볼 영역만 피부로 복원합니다. */
  var faceLayer = P2.face[o.f].layer;
  if (faceLayer && P2.facebox){
    var skin = x.getImageData(Math.floor(P2.head.x + P2.head.w/2), P2.head.y + 12, 1, 1).data;
    x.fillStyle = "rgb(" + skin[0] + "," + skin[1] + "," + skin[2] + ")";
    x.fillRect(faceLayer.x, P2.facebox[1]-1, faceLayer.w, 15);
    x.fillRect(faceLayer.x+3, P2.facebox[1]+14, faceLayer.w-6, 4);
  }
  if (P2.cloth[o.c].layer) put("cloth"+o.c, P2.cloth[o.c].layer);
  if (P2.face[o.f].layer)  put("face"+o.f,  P2.face[o.f].layer);
  var id = x.getImageData(0,0,N,N), d = id.data;
  var knitPants = P2.cloth[o.c].n === "니트", pantsColor = [128,86,52];
  for (var i = 0; i < d.length; i += 4){
    if (d[i+3] === 0) continue;
    var r = d[i], g = d[i+1], b = d[i+2], t = hsl(r,g,b), h = t[0], s = t[1], l = t[2];
    if (b > 70 && b - r > 60 && b - g > 40) tint(d, i, CC, l, 0.5);      /* 파랑이 확실히 우세한 픽셀만 (푸른빛 흰자 제외) */
    else if (knitPants && (i/4)%N >= 63 && (i/4)%N <= 96 &&
             Math.floor(i/4/N) >= 106 && Math.floor(i/4/N) < 142 && h > 18 && h < 48 && s > 0.25)
      tint(d, i, pantsColor, l, 0.7);  /* 니트의 바지는 피부색과 분리한 고정 갈색 */
    else if (h > 18 && h < 48 && s > 0.25 && l > 0.5 && l < 0.93) tint(d, i, SC, l, P2.skinL || 0.83);
  }
  x.putImageData(id, 0, 0);
  /* 2) 머리카락은 따로 그려서, 그 레이어의 붉은 픽셀만 머리색으로 바꿉니다 (얼굴은 건드리지 않음) */
  var HL = P2.hair[o.h].layer;
  if (HL && partImgs["hair"+o.h]){
    var hc = document.createElement("canvas"); hc.width = hc.height = N;
    var hx = hc.getContext("2d");
    hx.drawImage(partImgs["hair"+o.h], HL.x, HL.y);
    var hid = hx.getImageData(HL.x, HL.y, HL.w, HL.h), hd = hid.data;
    for (var j = 0; j < hd.length; j += 4){
      if (hd[j+3] === 0) continue;
      var hr = hd[j], hg = hd[j+1], hb = hd[j+2];
      if (hr > hg + 25 && hr > hb + 25) tint(hd, j, HC, hsl(hr,hg,hb)[2], 0.5);
    }
    hx.putImageData(hid, HL.x, HL.y);
    /* 긴 머리의 안쪽을 몸 뒤까지 이어서, 부품마다 다른 어깨 폭으로 생긴 틈을 메웁니다.
       얼굴 위와 짧은 머리는 그대로 두고, 몸이 없는 투명 픽셀에만 뒷머리를 그립니다. */
    var neckY = P2.head.y + P2.head.h;
    if (HL.y + HL.h > neckY + 10){
      var hairData = hx.getImageData(0,0,N,N).data;
      var center = Math.floor(P2.head.x + P2.head.w / 2);
      for (var rowY = neckY - 3; rowY < HL.y + HL.h; rowY++){
        var left = -1, right = -1;
        for (var colX = 0; colX < N; colX++){
          if (d[(rowY*N + colX)*4 + 3]){
            if (left < 0) left = colX;
            right = colX;
          }
        }
        if (left < 0 || left >= center || right <= center) continue;
        [-1, 1].forEach(function(side){
          var edge = side < 0 ? left : right;
          var hairX = edge + side;
          while (hairX >= 0 && hairX < N && Math.abs(hairX-edge) <= 12 &&
                 !hairData[(rowY*N + hairX)*4 + 3]) hairX += side;
          if (hairX < 0 || hairX >= N || Math.abs(hairX-edge) > 12) return;
          var src = (rowY*N + hairX)*4;
          for (var fillX = edge + side; fillX !== hairX; fillX += side){
            var dst = (rowY*N + fillX)*4;
            if (d[dst+3]) continue;
            d[dst] = HC[0]*0.65; d[dst+1] = HC[1]*0.65;
            d[dst+2] = HC[2]*0.65; d[dst+3] = hairData[src+3];
          }
        });
      }
      x.putImageData(id, 0, 0);
    }
    x.drawImage(hc, 0, 0);
  }
  /* 3) 안경 · 모자 */
  drawGlasses2(x, o.g);
  if (P2.hat[o.t].layer)     put("hat"+o.t,     P2.hat[o.t].layer);
  /* 4) 여백 계산 */
  id = x.getImageData(0,0,N,N); d = id.data;
  var minX=N, minY=N, maxX=-1, maxY=-1;
  for (var q = 0, p = 0; q < d.length; q += 4, p++){
    if (d[q+3] === 0) continue;
    var px = p % N, py = (p / N) | 0;
    if (px < minX) minX = px; if (px > maxX) maxX = px;
    if (py < minY) minY = py; if (py > maxY) maxY = py;
  }
  if (maxX < 0) return null;
  var out = document.createElement("canvas");
  out.width = maxX-minX+1; out.height = maxY-minY+1;
  out.getContext("2d").drawImage(cv, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  out.ox = minX; out.oy = minY;          // 원래 판(canvas) 기준 위치 — 얼굴 상자 계산용
  cache2[avatar] = out; cache2n++;
  return out;
}
/* v2 캐릭터를 상자(x,y,w,h) 안에 높이 맞춰 가운데 그리기 */
function drawAv2(ctx, avatar, x, y, w, h){
  var c = compose2(avatar); if (!c) return false;
  var s = Math.min(h / c.height, w / c.width);
  var dw = Math.round(c.width*s), dh = Math.round(c.height*s);
  var sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, Math.round(x + (w-dw)/2), Math.round(y + (h-dh)), dw, dh);
  ctx.imageSmoothingEnabled = sm;
  return true;
}

window.AV = {
  PARTS: P2, HAIR: HAIR2, SKIN: SKIN2, CLOTH: CLOTH2,
  ready: partsReady, isCode: isV2, parse: parseAv2, make: makeAv2, random: randAv2,
  compose: compose2, draw: drawAv2
};
})();
