"use strict";

/*
=========================================================
 SkyMedia Date / Visibility Utility

 Contract date format:
     YYYYMMDDHHmm

 dateAdd = when the material entered SkyMedia.
 date    = when the material becomes visible.

 Material is visible when date <= the current local date/time.
 A missing visibility date is treated as immediate visibility for
 backward compatibility; new Glide contracts should always supply it.
=========================================================
*/
window.SkyDate = (function () {
    const api = {};

    function digits(value) {
        return String(value ?? "").trim().replace(/[^0-9]/g, "");
    }

    function key(value) {
        const d = digits(value);
        if (/^\d{12}$/.test(d)) return d;
        if (/^\d{8}$/.test(d)) return d + "0000";
        return "";
    }

    function validKey(value) {
        const d = key(value);
        if (!/^\d{12}$/.test(d)) return false;
        const y=Number(d.slice(0,4)), m=Number(d.slice(4,6)), day=Number(d.slice(6,8));
        const h=Number(d.slice(8,10)), min=Number(d.slice(10,12));
        if (m<1 || m>12 || day<1 || day>31 || h>23 || min>59) return false;
        const date=new Date(y,m-1,day,h,min);
        return date.getFullYear()===y && date.getMonth()===m-1 && date.getDate()===day && date.getHours()===h && date.getMinutes()===min;
    }

    function nowKey(date=new Date()) {
        const pad=n=>String(n).padStart(2,"0");
        return String(date.getFullYear()) + pad(date.getMonth()+1) + pad(date.getDate()) + pad(date.getHours()) + pad(date.getMinutes());
    }

    function todayKey(date=new Date()) {
        return nowKey(date);
    }

    function isVisible(value, now=new Date()) {
        const d=key(value);
        if (!d) return true;
        if (!validKey(d)) return true;
        return d <= nowKey(now);
    }

    function dateAddOrNow(value, now=new Date()) {
        const d=key(value);
        return validKey(d) ? d : nowKey(now);
    }

    function compare(a,b) {
        const ka=key(a), kb=key(b);
        return (ka||"").localeCompare(kb||"");
    }

    api.digits=digits;
    api.key=key;
    api.validKey=validKey;
    api.nowKey=nowKey;
    api.todayKey=todayKey;
    api.isVisible=isVisible;
    api.dateAddOrNow=dateAddOrNow;
    api.compare=compare;
    api.format="YYYYMMDDHHmm";

    return api;
})();
