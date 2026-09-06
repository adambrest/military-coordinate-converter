"""Refresh offline map geometry (requires shapely; network needed only to regenerate)."""
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen
from shapely.geometry import box, Point, shape
from shapely.ops import unary_union

BASE='https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Basemaps/FoundationData/MapServer'
BBOX=[149.25,-23.65,151.45,-21.65]

def query(layer,where):
    params=dict(f='json',where=where,geometry=','.join(map(str,BBOX)),geometryType='esriGeometryEnvelope',inSR=4326,spatialRel='esriSpatialRelIntersects',outSR=4326,returnGeometry='true',outFields='*',maxAllowableOffset=.0008,geometryPrecision=5,resultRecordCount=2000)
    with urlopen(f'{BASE}/{layer}/query?'+urlencode(params),timeout=90) as response:
        data=json.load(response)
    assert 'error' not in data,data
    assert not data.get('exceededTransferLimit'), 'Query requires pagination'
    return data['features']

def clip(a,b):
    x,y=a; dx,dy=b[0]-x,b[1]-y; lo,hi=0,1
    for p,q in [(-dx,x-BBOX[0]),(dx,BBOX[2]-x),(-dy,y-BBOX[1]),(dy,BBOX[3]-y)]:
        if p==0:
            if q<0:return None
        elif p<0:lo=max(lo,q/p)
        else:hi=min(hi,q/p)
    if lo>hi:return None
    return [[round(x+lo*dx,5),round(y+lo*dy,5)],[round(x+hi*dx,5),round(y+hi*dy,5)]]

def paths(features):
    result=[]
    for feature in features:
        for path in feature['geometry']['paths']:
            current=[]
            for a,b in zip(path,path[1:]):
                segment=clip(a,b)
                if segment:
                    if current and current[-1]==segment[0]:current.append(segment[1])
                    else:
                        if len(current)>1:result.append(current)
                        current=segment
                elif current:
                    if len(current)>1:result.append(current)
                    current=[]
            if len(current)>1:result.append(current)
    return result

roads=query(23,"nat_route_no = 'A1' OR (class = 'Highway' AND (UPPER(road_name_full) = 'BRUCE HIGHWAY' OR UPPER(alias_1_name_full) = 'BRUCE HIGHWAY' OR UPPER(alias_2_name_full) = 'BRUCE HIGHWAY'))")
assert roads
LAND_URL='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson'
with urlopen(LAND_URL,timeout=90) as response: land_data=json.load(response)
clipped=unary_union([shape(f['geometry']).intersection(box(*BBOX)) for f in land_data['features'] if shape(f['geometry']).intersects(box(*BBOX))])
polygons=list(clipped.geoms) if hasattr(clipped,'geoms') else [clipped]
mainland=next(p for p in polygons if p.covers(Point(150.13259,-22.81253)))
assert not mainland.covers(Point(151.3,-22.5)), 'Land must not include open ocean'
land=[mainland]+[p for p in polygons if p!=mainland and p.area>.003 and not p.intersects(box(*BBOX).boundary)]
def rounded(coords): return [[round(x,4),round(y,4)] for x,y in coords]
land=[rounded(p.simplify(.006,preserve_topology=True).exterior.coords) for p in land]
data={'land':land,'roads':paths(roads)}
assert data['land'] and data['roads']
Path('australia-map.js').write_text('// Land: Natural Earth 1:10m (public domain), simplified; small islands omitted.\n// A1: Queensland Foundation Data layer 23, Copyright State of Queensland (Department of Resources) 2024.\n'+'globalThis.AUSTRALIA_MAP = '+json.dumps(data,separators=(',',':'))+';\n',encoding='utf-8')
print('Saved',len(data['land']),'land polygons and',len(data['roads']),'highway segments')
print('Highway route values:',sorted({str(f['attributes'].get('nat_route_no')) for f in roads}))
