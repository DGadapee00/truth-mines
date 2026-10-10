$( A tiny Metamath database for the pipeline tests. It is not a sound logic; the pipeline does
   not check proofs, it reads which results each proof cites. $)

$c ( ) -> wff |- $.
$v ph ps ch $.
wph $f wff ph $.
wps $f wff ps $.
wch $f wff ch $.
wi $a wff ( ph -> ps ) $.

$(
###############################################################################
  FIRST PART
###############################################################################
$)

  $( Axiom one. $)
  ax-one $a |- ( ph -> ( ps -> ph ) ) $.

  ${
    min $e |- ph $.
    maj $e |- ( ph -> ps ) $.
    $( Modus ponens. $)
    ax-mp $a |- ps $.
  $}

  $( Define a symbol (in name only). $)
  df-thing $a |- ( ph -> ph ) $.

  $( A theorem citing the axiom twice and syntax once (normal proof). $)
  th1 $p |- ( ph -> ph ) $= wph wph wi ax-one ax-one ax-mp $.

  ${
    th2.1 $e |- ph $.
    $( A theorem with a hypothesis, compressed proof citing th1 and the definition. $)
    th2 $p |- ( ps -> ph ) $= ( wi th1 df-thing ) ABCDE $.
  $}

$(
###############################################################################
  SECOND PART
###############################################################################
$)

  $( Cites th2 only. $)
  th3 $p |- ( ch -> ch ) $= ( th2 ) AB $.

  $( Cites th3, which cites th2. $)
  th4 $p |- ( ph -> ch ) $= ( th3 ax-mp ) AB $.

  $( Cites th4 and th2: the th2 tunnel is redundant once th3, th4 are landmarks. $)
  th5 $p |- ( ps -> ch ) $= ( th4 th2 ) AB $.

  ${
    idh $e |- ph $.
    $( Proved from its own hypothesis alone. $)
    idt $p |- ph $= idh $.
  $}

$( $t
  latexdef "(" as "(";
  latexdef ")" as ")";
  latexdef "->" as "\rightarrow";
  latexdef "|-" as "\vdash";
  latexdef "ph" as "\varphi";
  latexdef 'ps' as '\psi';
  latexdef "ch" as "\chi" + "";
$)
