import json, re, uuid, urllib.parse
class Mock:
    def __init__(s): s.users={}; s.profiles={}; s.fields={}; s.counters={}; s.calls=[]
    def uid_from(s,h):
        a=h.get('authorization','');t=a.replace('Bearer ','')
        return t[4:] if t.startswith('tok-') else None
    def sess(s,u): return {'access_token':'tok-'+u['id'],'refresh_token':'r-'+u['id'],'expires_in':3600,'user':{'id':u['id'],'email':u['email']}}
    def handle(s,method,url,headers,body):
        p=urllib.parse.urlparse(url); path=p.path; q=urllib.parse.parse_qs(p.query); b=json.loads(body) if body else {}
        uid=s.uid_from(headers); s.calls.append(f'{method} {path}')
        adm=uid and s.profiles.get(uid,{}).get('role')=='admin'
        if path=='/auth/v1/signup':
            if any(u['email']==b['email'] for u in s.users.values()): return 400,{'msg':'User already registered'}
            u={'id':str(uuid.uuid4()),'email':b['email'],'pw':b['password']}; s.users[u['id']]=u
            s.profiles[u['id']]={'id':u['id'],'email':u['email'],'full_name':b.get('data',{}).get('full_name',''),'farm_name':'','role':'admin' if u['email']=='doagronomi@gmail.com' else 'farmer','consent_version':None,'research_consent':False}
            return 200,s.sess(u)
        if path=='/auth/v1/token':
            if q.get('grant_type')==['password']:
                for u in s.users.values():
                    if u['email']==b['email'] and u['pw']==b['password']: return 200,s.sess(u)
                return 400,{'error_description':'Invalid login credentials'}
            return 200,s.sess(s.users[b['refresh_token'][2:]])
        if path=='/auth/v1/user': return 200,{'id':uid,'email':s.users[uid]['email']}
        if path=='/auth/v1/logout': return 204,None
        if path.startswith('/rest/v1/rpc/demo_'):
            s.users.setdefault('demo',{'id':'demo','email':'demo@x'});s.profiles.setdefault('demo',{'id':'demo','role':'farmer'})
            st,bd=s.handle(method,url.replace('/rpc/demo_','/rpc/'),{'authorization':'Bearer tok-demo'},body)
            if isinstance(bd,dict) and 'admin' in bd: bd['admin']=False
            return st,bd
        if not uid: return 401,{'message':'JWT required'}
        if path=='/rest/v1/profiles':
            if method=='GET':
                if 'id' in q: i=q['id'][0][3:]; return 200,[s.profiles[i]] if (i==uid or adm) and i in s.profiles else []
                return 200,[v for k,v in s.profiles.items() if k==uid or adm]
            if method=='PATCH':
                i=q['id'][0][3:]; b.pop('role',None); s.profiles[i].update(b); return 200,[s.profiles[i]]
        if path=='/rest/v1/rpc/next_field_code':
            import unicodedata as _u
            ex=s.fields.get(b.get('p_field') or '')
            if ex and __import__('re').fullmatch(r'[A-Z]{2,3}-\d{3,}', ex.get('code') or ''): return 200,ex['code']
            st=''.join(c for c in _u.normalize('NFD',b.get('p_settlement') or b.get('p_prefix') or '') if c.isalpha() and ord(c)<128)
            pf=(st[:3].upper() if len(st)>=2 else 'TBL'); pf='TBL' if pf=='TAB' else pf
            s.counters[pf]=s.counters.get(pf,0)+1; return 200,f"{pf}-{s.counters[pf]:03d}"
        if path=='/rest/v1/rpc/save_field':
            f=b['p_field']; ex=s.fields.get(f['id'])
            if ex and ex['owner']!=uid and not adm: return 403,{'message':'new row violates row-level security policy'}
            owner=ex['owner'] if ex else uid
            import re as _re
            code=ex['code'] if ex and _re.fullmatch(r'[A-Z]{2,3}-\d{3,}', ex.get('code') or '') else f.get('code')
            s.fields[f['id']]=dict(f,code=code,owner=owner,deleted_at=None,parts=b['p_parts']); return 200,{'ok':True,'code':code}
        if path=='/rest/v1/rpc/get_stats':
            R=lambda lvl,reg,crop,ha,nf,ym=None: {'lvl':lvl,'region':reg,'year':2025,'crop':crop,'ok':True,'ha':ha,'nf':nf,'no':4,'ny':nf if ym else 0,'y_mean':ym,'y_med':ym,'y_p25':ym and round(ym*0.9,2),'y_p75':ym and round(ym*1.08,2)}
            return 200,{'admin':True,'raw':False,'k_fields':5,'k_owners':3,'totals':{'ok':True,'fields':42,'owners':9,'ha':1240.5,'settlements':6},
              'rows':[R('all','Összes','Kukorica',510,18,9.8),R('all','Összes','Napraforgó',280,10,3.1),R('all','Összes','Őszi búza',220,8,6.4),
                      R('county','Bács-Kiskun','Kukorica',510,18,9.8),R('district','Kalocsai járás','Kukorica',350,13,9.6),R('settlement','Harta','Kukorica',190,7,10.2),R('settlement','Dunapataj','Kukorica',160,6,9.1)],
              'hidden':[],'year_totals':[{'lvl':'all','region':'Összes','year':2025,'ok':True,'ha':1100,'nf':40},{'lvl':'county','region':'Bács-Kiskun','year':2025,'ok':True,'ha':1100,'nf':40},
                {'lvl':'district','region':'Kalocsai járás','year':2025,'ok':True,'ha':700,'nf':24},{'lvl':'settlement','region':'Harta','year':2025,'ok':True,'ha':400,'nf':14},{'lvl':'settlement','region':'Dunapataj','year':2025,'ok':True,'ha':300,'nf':10}]}
        if path=='/rest/v1/rpc/admin_quality':
            return 200,{'partners':[{'name':'Teszt Elek','email':'t@x.hu','farm':'Teszt Kft','since':'2026-11-01','research':True,'fields':5,'ha':120,'last':'2026-11-14T10:00:00Z','rows':12,'miss_crop':2,'miss_yield':5,'miss_sowing':3,'miss_density':1}],
              'suspicious':[{'owner':'Teszt Elek','code':'HARTA-0003','year':2025,'crop':'Kukorica','part':'Egész tábla','issue':'szokatlan kukoricahozam: 24 t/ha'}]}
        if path=='/rest/v1/rpc/hybrid_names':
            return 200,[{'key':'DKC4897','name':'DKC_4897','crop':'Kukorica','approved':True,'no':5,'n':9},{'key':'DKC5092','name':'DKC_5092','crop':'Kukorica','approved':True,'no':4,'n':6},{'key':'DKC4899','name':'DKC_4899','crop':'Kukorica','approved':False,'no':1,'n':1}]
        if path in ('/rest/v1/rpc/admin_approve_hybrid','/rest/v1/rpc/admin_rename_hybrid'):
            return 200,3
        if path=='/rest/v1/rpc/gxe_stats':
            import os
            return 200,json.load(open(os.path.join(os.path.dirname(__file__),'gxe_sample.json')))
        if path=='/rest/v1/rpc/crop_profile':
            import os
            return 200,json.load(open(os.path.join(os.path.dirname(__file__),'profile_sample.json')))
        if path=='/rest/v1/rpc/gxe_field':
            return 200,{'ok':True,'env':2,'ff':1.04,'own_history':True}
        if path=='/rest/v1/rpc/delete_my_data':
            for k in [k for k,v in s.fields.items() if v['owner']==uid]: del s.fields[k]
            s.profiles.pop(uid,None); s.users.pop(uid,None); return 200,{'ok':True}
        if path=='/rest/v1/fields':
            if method=='GET':
                return 200,[{k:v[k] for k in ['id','owner','code','nickname','settlement','county','hrsz','data']} | {'updated_at':'x'} for v in s.fields.values() if (v['owner']==uid or adm) and not v['deleted_at']]
            if method=='PATCH':
                i=q['id'][0][3:]; v=s.fields.get(i)
                if v and (v['owner']==uid or adm): v.update(b)
                return 204,None
        if path in('/rest/v1/parts','/rest/v1/audit_log'): return 200,[]
        return 404,{'message':'nincs: '+path}
