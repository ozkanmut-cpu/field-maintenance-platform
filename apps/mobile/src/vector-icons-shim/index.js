const React = require('react');
const { Text } = require('react-native');
const glyphs = {tool:'◇','log-out':'→','log-in':'→',clipboard:'▣',users:'◎','user-plus':'+',clock:'◷','alert-circle':'!',calendar:'□',refresh:'↻','refresh-cw':'↻','check-circle':'✓',check:'✓',navigation:'↗','alert-triangle':'!',hash:'#','map-pin':'⌖',box:'□',server:'▤',droplet:'◦',activity:'∿','chevron-right':'›','arrow-left':'‹',crosshair:'⌾',save:'✓',x:'×','rotate-ccw':'↶',inbox:'□',info:'i',image:'▧','arrow-right':'›'};
function Feather({name,size=18,color='#075A96',style}) { return React.createElement(Text,{style:[{fontSize:size,color,fontWeight:'800',lineHeight:size+3,textAlign:'center'},style]},glyphs[name]||'•'); }
module.exports={Feather};
